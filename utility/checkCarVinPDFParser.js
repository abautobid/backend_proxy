const fs = require('fs');
const pdf = require('pdf-parse');


async function extractExportInfo(lines) {
  const exportInfo = {
    exported_from_korea: false,
    mileage: null,
    first_registration: null,
    last_registration: null,
    deregistration_date: null,
    appointment_of_deregistration: false,
    damaged: false
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Normalize text
    const normalized = line.toLowerCase().replace(/\s+/g, ' ').trim();

    if (normalized.includes('export from korea')) {
      exportInfo.exported_from_korea = true;
    }

    if (normalized.includes('mileage')) {
      const match = line.match(/([\d,]+\s*km)/i);
      if (match) {
        exportInfo.mileage = match[1].replace(/\s+/g, '');
      }
    }

    if (line.toLowerCase().includes('date first registra')) {
  const match = line.match(/(\d{4}-\d{2}-\d{2})/);
  if (match) exportInfo.first_registration = match[1];
}

if (line.toLowerCase().includes('last first registra')) {
  const match = line.match(/(\d{4}-\d{2}-\d{2})/);
  if (match) exportInfo.last_registration = match[1];
}

if (line.toLowerCase().includes('date registra') && line.toLowerCase().includes('cancella')) {
  const match = line.match(/(\d{4}-\d{2}-\d{2})/);
  if (match) exportInfo.deregistration_date = match[1];
}


    if (normalized.includes('appointment of deregistration')) {
      exportInfo.appointment_of_deregistration = true;
    }

    if (normalized.startsWith('damaged')) {
      const damagedValue = line.split('Damaged')[1]?.trim().toLowerCase();
      exportInfo.damaged = damagedValue !== '-' && damagedValue !== 'no';
    }
  }

  return exportInfo;
}


async function extractAccidents(lines) {
  const accidents = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const accidentNumMatch = line.match(/^Accident #(\d+)/);
    if (accidentNumMatch && i > 0) {
      const accident = {
        number: parseInt(accidentNumMatch[1]),
        date: lines[i - 1],
        detail_usd: null,
        wages_usd: null,
        painting_usd: null,
        repair_cost_usd: null,
        culprit: true,
      };

      // Parse until after "Accident vehicle 2"
      let j = i + 1;
      while (j < lines.length) {
        const current = lines[j];

        const detailMatch = current.match(/Detail\s*([\d,]+)\s*USD/i);
        if (detailMatch) {
          accident.detail_usd = parseInt(detailMatch[1].replace(/,/g, ''));
        }

        const wagesMatch = current.match(/Wages\s*([\d,]+)\s*USD/i);
        if (wagesMatch) {
          accident.wages_usd = parseInt(wagesMatch[1].replace(/,/g, ''));
        }

        const paintingMatch = current.match(/Pain(?:t|n)ing\s*([\d,]+)\s*USD/i);
        if (paintingMatch) {
          accident.painting_usd = parseInt(paintingMatch[1].replace(/,/g, ''));
        }

        const repairMatch = current.match(/Total Repair.*cost\s*([\d,]+)\s*USD/i);
        if (repairMatch) {
          accident.repair_cost_usd = parseInt(repairMatch[1].replace(/,/g, ''));
        }

        if (current.toLowerCase().includes("not the culprit")) {
          accident.culprit = false;
        }

        // Stop after 1 line beyond "Accident vehicle 2"
        if (current.includes("Accident vehicle 2")) {
          j++;
          break;
        }

        j++;
      }

      accidents.push(accident);
      i = j; // skip processed block
    }
  }

  return accidents;
}




async function extractVehicleData(filePath) {
  const dataBuffer = fs.readFileSync(filePath);
  const data = await pdf(dataBuffer);
  const lines = data.text.split('\n').map(line => line.trim()).filter(Boolean);

  const report = {
    model: null,
    year: null,
    vin: null,
    report_id: null,
    report_date: null,
    general_information: {},
	vehicle_specifications: {},
	advanced_safety_systems : {},
	ownership_history  : {},
	mileages : {},
	accidents: {},
	export_info:{},
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Model + Year
    if (line === 'Vehicle history report' && lines[i + 1]) {
      const match = lines[i + 1].match(/^(.*),\s*(\d{4})$/);
      if (match) {
        report.model = match[1].trim();
        report.year = match[2];
      }
    }

    // VIN, Report ID, Report Date (on next line)
    if (line === 'VIN:' && lines[i + 1]) report.vin = lines[i + 1].trim();
    if (line === 'Report ID:' && lines[i + 1]) report.report_id = lines[i + 1].trim();
    if (line === 'Report Date:' && lines[i + 1]) report.report_date = lines[i + 1].trim();

    if (line === 'General Information') {
	  const generalInfo = {};
	  generalInfo['general_information'] = lines[i + 1]; // e.g. 5/12 attention marks
	  let j = i + 2;

	  while (j < lines.length) {
		let key = lines[j];
		let next = lines[j + 1] || '';
		let value = lines[j + 2] || '';

		// Handle multi-line keys
		if (key === 'Special purpose' && next === 'history') {
		  key = 'Special purpose history';
		  value = lines[j + 2];
		  j += 3;
		} else if (key === 'Damage to this car by' && next === 'another car') {
		  key = 'Damage to this car by another car';
		  value = lines[j + 2];
		  j += 3;
		} else if (key === 'Damage to another car' && next === 'by this car') {
		  key = 'Damage to another car by this car';
		  value = lines[j + 2];
		  j += 3;
		} else {
		  key = key.trim();
		  value = next.trim();
		  j += 2;
		}

		// Exit if we reach the final known key
		if (key === 'History of public use') {
		  generalInfo['history_of_public_use'] = value;
		  break;
		}

		const formattedKey = key.toLowerCase().replace(/\s+/g, '_');
		generalInfo[formattedKey] = value;
	  }
	  

	  report.general_information = generalInfo;
	}

    // Handle Vehicle Specifications section
    if (line === 'Vehicle Specifications') {
      const specKeys = [
        'Year', 'Country', 'Make', 'Model', 'Body', 'Doors', 'Color',
        'Engine capacity', 'Standard', 'Fuel type', 'Drive Type',
        'Transmission', 'Keys', 'Height', 'Length', 'Width'
      ];

      const specs = {};
      let j = i + 1;

      while (j < lines.length && !lines[j].startsWith('Advanced Safety Devices')) {
        const specLine = lines[j].trim();

        for (const key of specKeys) {
          const keyNoSpace = key.replace(/\s+/g, '');
          if (specLine.startsWith(keyNoSpace)) {
            const value = specLine.slice(keyNoSpace.length).trim();
            const normalizedKey = key.toLowerCase().replace(/\s+/g, '_');
            specs[normalizedKey] = value;
            break;
          }
        }

        j++;
      }

      report.vehicle_specifications = specs;
    }
	
	    // Handle Advanced Safety Devices section
        // Handle Advanced Safety Devices section (ends before "Ownership history")
    if (line === 'Advanced Safety Devices') {
      const safetyFeatures = {};
      let j = i;
      while (j < lines.length) {
        const key = lines[j]?.trim();
        const value = lines[j + 1]?.trim();

        // End if we reach ownership history or key/value not valid
        if (!key || !value || key === 'Ownership history') break;

        // Stop if line is not followed by a value
        if (!lines[j + 1] || lines[j + 1] === 'Ownership history') break;

        // Normalize key
        const normalizedKey = key
          .toLowerCase()
          .replace(/\s+/g, '_')
          .replace(/[()]/g, '')
          .replace(/__+/g, '_');

        safetyFeatures[normalizedKey] = value;

        j += 2;
      }

      report.advanced_safety_systems = safetyFeatures;
    }
	

	if (line === 'Ownership history') {
	  const owners = [];
	  let j = i + 1;

	  // Optional: extract ownership count
	  const countMatch = lines[j]?.match(/^(\d+)\s+owner/);
	  if (countMatch) {
		report.number_of_owners = parseInt(countMatch[1]);
		j++; // Skip this line
	  }

	  while (j < lines.length && !lines[j].startsWith('Mileages')) {
		const currentLine = lines[j];
		const ownerMatch = currentLine.match(/^(\d+)\s+owner/);
		if (ownerMatch) {
		  const owner = {
			owner_number: parseInt(ownerMatch[1]),
			mileage: null,
			change_number: null,
			change_owner: null,
			vehicle_use: null,
			date_record: null
		  };

		  let k = j + 1;
		  while (
			k < lines.length &&
			!lines[k].match(/^\d+\s+owner/) &&
			!lines[k].startsWith('Mileages')
		  ) {
			const keyValLine = lines[k].trim();
			if (keyValLine.startsWith('Mileage')) {
			  const kmMatch = keyValLine.match(/Mileage\s+(.*)/);
			  if (kmMatch) {
				owner.mileage = kmMatch[1].trim();
			  }
			} else if (keyValLine.startsWith('Change number')) {
			  const val = keyValLine.replace('Change number', '').trim();
			  if (val && val !== '-') owner.change_number = val;
			} else if (keyValLine.startsWith('Change owner')) {
			  const val = keyValLine.replace('Change owner', '').trim();
			  if (val && val !== '-') owner.change_owner = val;
			} else if (keyValLine.startsWith('Vehicle use')) {
			  const val = keyValLine.replace('Vehicle use', '').trim();
			  if (val && val !== '-') owner.vehicle_use = val;
			} else if (keyValLine.startsWith('Date record')) {
			  const val = keyValLine.replace('Date record', '').trim();
			  owner.date_record = val;
			}

			k++;
		  }

		  owners.push(owner);
		  j = k - 1;
		}

		j++;
	  }

	  report.ownership_history = owners;
	}


	// Mileages (starts after "Source: Checkcar.vin")
	const mileageIndex = lines.findIndex(line => line === 'Source: Checkcar.vin');
	if (mileageIndex !== -1) {
	  const mileages = [];
	  let j = mileageIndex + 1;
	  while (j + 1 < lines.length) {
		const date = lines[j];
		const kmLine = lines[j + 1];
		const dateMatch = date.match(/^\d{4}-\d{2}-\d{2}$/);
		const kmMatch = kmLine.match(/^(\d[\d,]*)\s?km$/i);

		if (dateMatch && kmMatch) {
		  mileages.push({
			date: dateMatch[0],
			mileage: kmMatch[1].replace(/,/g, '') + ' km'
		  });
		  j += 2;
		} else {
		  break;
		}
	  }

	  report.mileages = mileages;
	}
	
	report.accidents = await extractAccidents(lines);
	report.export_info = await extractExportInfo(lines);


  }

  return report;
}

async function normalizeKey(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, '_');
}



module.exports = {
    extractVehicleData
};
