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
  technical_inspection:{},
  auction_sales:{},
  
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
  const specKeys = {
    'year': 'year',
    'country': 'country',
    'make': 'make',
    'model': 'model',
    'body': 'body',
    'doors': 'doors',
    'color': 'color',
    'engine capacity': 'engine_capacity',
    'standard seating': 'standard_seating',
    'fuel type': 'fuel_type',
    'drive type': 'drive_type',
    'transmission': 'transmission',
    'keys': 'keys',
    'height': 'height',
    'length': 'length',
    'width': 'width'
  };

  const specs = {};
  let j = i + 1;

  while (j < lines.length && !lines[j].startsWith('Advanced Safety Devices')) {
    const rawLine = lines[j].replace(/\u0000/g, '').trim();

    for (const label in specKeys) {
      // Match both spaced and glued formats
      const pattern = new RegExp(`^${label.replace(/\s+/g, '')}(.*)$`, 'i');
      const altPattern = new RegExp(`^${label}(.*)$`, 'i');
      
      let match = rawLine.match(pattern) || rawLine.match(altPattern);

      if (match) {
        specs[specKeys[label]] = match[1].trim();
        break;
      }
    }

    j++;
  }

  report.vehicle_specifications = specs;
}

	
	    
	if (line === 'Advanced Safety Devices') {
	  report.advanced_safety_systems = await extractAdvancedSafetyDevices(lines.slice(i));
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
	report.technical_inspection = await  extractTechnicalInspection(lines);
	report.auction_sales = await extractAuctionSales(lines);
 

  }

  return report;
}

async function normalizeKey(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, '_');
}



async function extractAuctionSales(lines) {
  const auctions = [];
  let current = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Start of a new auction block
    const soldMatch = line.match(/^SOLD\s+#(\d+)/);
    if (soldMatch) {
      if (current) auctions.push(current);
      current = {
        number: parseInt(soldMatch[1]),
        price_usd: null,
        mileage: null,
        platform: null,
        date: null,
        make: null,
        model: null,
        year: null,
        engine_capacity: null,
        body: null,
        transmission: null
      };
    }

    if (current) {
      // Standard full format with mileage
      const fullMatch = line.match(/(\d+)\s*USD\s*([\d,]+)\s*km\s*([A-Z0-9.]+)\s*(\d{4}-\d{2}-\d{2})/i);
      if (fullMatch) {
        current.price_usd = parseInt(fullMatch[1]);
        current.mileage = fullMatch[2].replace(/,/g, "") + " km";
        current.platform = fullMatch[3];
        current.date = fullMatch[4];
        continue;
      }

      // Compact format without mileage
      const compactMatch = line.match(/^(\d+)\s*USD\s*([A-Z0-9.]+)(\d{4}-\d{2}-\d{2})$/i);
      if (compactMatch) {
        current.price_usd = parseInt(compactMatch[1]);
        current.platform = compactMatch[2];
        current.date = compactMatch[3];
        continue;
      }

      // VEHICLE INFO parsing
      if (line.startsWith("Make")) {
        current.make = line.replace("Make", "").trim();
      } else if (line.startsWith("Model")) {
        current.model = line.replace("Model", "").trim();
      } else if (line.startsWith("Year")) {
        const year = parseInt(line.replace("Year", "").trim());
        if (!isNaN(year)) current.year = year;
      } else if (line.startsWith("Engine capacity")) {
        current.engine_capacity = line.replace("Engine capacity", "").trim();
      } else if (line.startsWith("Body")) {
        current.body = line.replace("Body", "").trim();
      } else if (line.startsWith("Transmission")) {
        current.transmission = line.replace("Transmission", "").trim();
      }
    }
  }

  // Add final auction if exists
  if (current) auctions.push(current);

  return auctions;
}



async function extractTechnicalInspection(lines) {
  const result = {
    valid_from: null,
    valid_to: null,
    mileage_at_inspection: null,
  };

  const startIndex = lines.findIndex(line => line.includes('Technical inspection'));
  const endIndex = lines.findIndex((line, i) => i > startIndex && line.includes('Source: Checkcar.vin'));

  if (startIndex !== -1 && endIndex !== -1) {
    for (let i = startIndex; i <= endIndex; i++) {
      const line = lines[i];

      const fromMatch = line.match(/Date from\s*(\d{4}-\d{2}-\d{2})/);
      if (fromMatch) result.valid_from = fromMatch[1];

      const toMatch = line.match(/Date to\s*(\d{4}-\d{2}-\d{2})/);
      if (toMatch) result.valid_to = toMatch[1];

      const mileageMatch = line.match(/Mileage\s*([\d,]+)\s*km/);
      if (mileageMatch) result.mileage_at_inspection = mileageMatch[1].replace(/,/g, '') + ' km';
    }
  }

  return result;
}

function extractAdvancedSafetyDevices(lines) {
  const safetyFeatures = {};
  const startIndex = lines.findIndex(line => line.trim() === 'Advanced Safety Devices');
  if (startIndex === -1) return safetyFeatures;

  for (let i = startIndex + 1; i < lines.length; i += 2) {
    const keyLine = lines[i]?.trim();
    const valueLine = lines[i + 1]?.trim();

    if (!keyLine || !valueLine) break;

    // Skip lines like "5 installed"
    if (/^\d+\s+installed$/i.test(keyLine)) {
      i--; // adjust index back
      continue;
    }

    // Stop if we reached the next section
    if (keyLine === 'Ownership history') break;

    const normalizedKey = keyLine
      .toLowerCase()
      .replace(/[()]/g, '')
      .replace(/\s+/g, '_')
      .replace(/__+/g, '_');

    safetyFeatures[normalizedKey] = valueLine;
  }

  return safetyFeatures;
}






module.exports = {
    extractVehicleData
};
