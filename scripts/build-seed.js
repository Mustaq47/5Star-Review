// scripts/build-seed.js
// Author the curated seed corpus for the review brain.
//
// Rather than shipping hundreds of hand-typed reviews, this script expands a
// compact set of curated template exemplars (per business type and rating tier)
// into data/brain/seed/<type>.jsonl. Each generated record keeps a `guide` line
// (concise style guidance for that type) and `exemplar` records (real-sounding
// reviews). The output is deterministic and re-runnable.
//
// Run: node scripts/build-seed.js            (write all seed files)
//      node scripts/build-seed.js --check    (print per-type record counts)

const fs = require('fs');
const path = require('path');
const { SEED_DIR } = require('../services/reviewBrain');

const OUT = SEED_DIR;

// ------------------------------------------------------------------
// Curated per-type knowledge: style guidance + exemplar seed templates.
// Every record is positive-first; low ratings stay constructive.
// ------------------------------------------------------------------
const TYPES = {
  restaurant: {
    guide: [
      'Lead with the standout dish or the vibe; mention service and portion size.',
      'Keep it to 2-4 sentences; specifics beat superlatives.',
      'For 5 stars: show why you will return. For 3: name one good, one improvable.',
      'Never invent prices or dishes not in the user notes.'
    ],
    exemplars: {
      5: [
        'Stopped by for a quick dinner and ended up staying two hours. The butter chicken was rich and perfectly spiced, and the garlic naan came off the griddle pillowy soft. Service was warm without being hovering. Already planning our next visit.',
        'Took my parents for lunch here for their anniversary. The staff wished them and even brought a small dessert on the house. Food was fresh and every dish we ordered hit the mark. A place that genuinely cares about its customers.',
        'The tandoori platter was generous and the paneer tikka had that perfect char. Despite a full house our order landed in under fifteen minutes. Sweet, attentive staff too. This is easily our new Friday spot.',
        'Everything we ordered tasted freshly made and the portions were honest. The serving team checked on us without hovering. Felt like a proper family meal out, not a rushed service. Will be back soon.'
      ],
      4: [
        'Really glad we stopped here. The cold coffee was excellent and the mushroom pizza had a nice thin crust. It was crowded so we waited a bit for a table, but the food made up for it. Would happily come again on a slower evening.',
        'Solid lunch spot. The biryani was flavourful and generously portioned; the service was a little slow even though the place was not full. Prices are mid-range. Would come back for the biryani if I am in the area.'
      ],
      3: [
        'Had a decent lunch here. The biryani was flavourful and generous in portion, but the service was a little slow. Prices are mid-range. Would come back for the biryani if I am in the area.',
        'The food was good and fresh, though the wait was longer than expected in the evening. The manager apologised and offered a small discount. A fine option if you have time to spare.'
      ],
      2: [
        'The burger was juicy but we waited close to an hour with minimal updates. The food quality gives me hope. If they sort out the wait times, this could easily become a favourite.'
      ],
      1: [
        'The dish arrived cold and under-seasoned, and it took a while to get attention. That said, the staff apologised and offered to remake it. I genuinely hope they improve the kitchen consistency, because the place itself is nice and clearly has potential.'
      ]
    }
  },

  cafe: {
    guide: [
      'Writers here value ambience, coffee quality, and seating more than formality.',
      'Mention wifi/outlets when relevant; cafés are often work spots.',
      'Keep sentences short and human; a small quirk makes it believable.'
    ],
    exemplars: {
      5: [
        'The coffee here is genuinely good and the seating is comfortable, with enough outlets that I can work all afternoon. Staff remember regulars by name. My go-to spot for slow mornings.',
        'Found this place by accident and now I am a regular. Flat white was perfect, and the banana bread came warm. Cozy little corner by the window. Exactly the kind of café every neighbourhood needs.'
      ],
      4: [
        'Good coffee and a calm atmosphere. The cold coffee was excellent and the interior is a nice place to sit. Parking gets a little tight on weekends, but that is not their fault.',
        'Nice café with a solid menu and friendly staff. It fills up fast by noon and the outlet situation is limited; bring a charger. A fine place to get work done if you come early.'
      ],
      3: [
        'The coffee is good and the wifi works well, which is what I mainly needed. Seating gets packed by noon. A fine place to get work done if you come early.',
        'Decent café overall. The pastry case looked better than it tasted, but the cappuccino was solid. Service was polite. Worth a try if you are in the area.'
      ],
      2: [
        'Average visit. The coffee was lukewarm and the sandwich took a while. The staff were polite throughout. Hoping they tighten up the order flow, because the location is lovely.'
      ]
    }
  },

  salon: {
    guide: [
      'Focus on the result, the stylist listening, cleanliness, and whether prices matched.',
      'Clients appreciate when the stylist asks before cutting.',
      'Low stars stay about one specific thing, then pivot to what was okay.'
    ],
    exemplars: {
      5: [
        'Booked an appointment for a trim and left feeling like a new person. Neat chairs, clean tools, and the barber actually listened to what I wanted before picking up scissors. Best haircut I have had in ages.',
        'The stylist understood exactly what I meant by just a trim and did a clean, neat job. Prices were fair for the work they did. Only minor thing is the place could use a little better ventilation. Otherwise, a great local find.'
      ],
      4: [
        'Solid experience at this salon. My stylist got the cut exactly right and the wash was relaxing. Prices are fair. Would happily return next month.',
        'Good haircut, friendly staff, and the wait was short. The salon felt clean and modern. Wish they had slightly more parking, but that is not on them.'
      ],
      3: [
        'Average experience at the salon. The haircut came out okay and the staff were polite, but it took longer than promised. Hope they tighten the finishing touches, because the basics are there.'
      ],
      2: [
        'Not my best visit. The staff were genuinely polite throughout, though. The cut came out okay. I hope they tighten up on scheduling, because the team clearly means well.'
      ]
    }
  },

  courier: {
    guide: [
      'Mention timeline, packaging, tracking, and support quality.',
      'Reliability is the core theme; delays are framed constructively.',
      'Praise prompt pickup and safe arrival.'
    ],
    exemplars: {
      5: [
        'The courier picked up my parcel the same evening and it reached Bangalore two days early, packaged in a way that survived a monsoon. Tracking updates were prompt at every step. For the price, this service is hard to beat.'
      ],
      4: [
        'The parcel took a day longer than the estimate, but the packaging was solid and the tracking accurate the whole way. When I called, the support team was polite and clarified the delay quickly. Reliable enough for everyday orders.'
      ],
      3: [
        'The courier service works, but tracking updates were sparse after dispatch. The package arrived safely and intact within the promised window. A workable option for non-urgent deliveries.'
      ],
      1: [
        'Package arrived two days late and there was no tracking update until the day of delivery. Customer care was responsive and apologised. If they tighten their timelines, they could be a reliable choice.'
      ]
    }
  },

  hotel: {
    guide: [
      'Mention room cleanliness, bed comfort, staff helpfulness, and amenities.',
      'Location and quiet matter as much as luxury for many guests.',
      'Low stays acknowledge the issue once, then the upside.'
    ],
    exemplars: {
      5: [
        'Went in expecting a basic hotel stay and got way more. Room was spotless, the bed genuinely comfortable, and a quiet corner to work from in the morning. Reception even helped me book a cab at 6 am. Will happily stay here again.'
      ],
      4: [
        'Decent stay overall. Rooms were clean and the AC worked well, and breakfast had a good variety. Check-in took slightly longer because they were short-staffed, but the desk staff were courteous throughout. A comfortable, no-fuss stay for the price.'
      ],
      3: [
        'The room was decent for the price, with a clean bed and a working TV. The bathroom could use a deeper clean and the corridor was a bit noisy in the morning. Staff were helpful when I asked for extra towels. Acceptable for a simple overnight stay.'
      ],
      2: [
        'The AC in our room was noisy and kept cycling, so sleep was patchy. On the bright side, the bed was comfortable and housekeeping responded quickly with extra blankets. If they service the ACs, this would be a decent value stay.'
      ]
    }
  },

  gym: {
    guide: [
      'Mention equipment variety, crowding, changing rooms, and trainer attention.',
      'Regulars like specific machines and unhurried timing.',
      'Keep the tone encouraging and specific.'
    ],
    exemplars: {
      5: [
        'Great gym with modern equipment and enough machines that you rarely wait. The crowd is mostly regulars so it does not feel intimidating. The trainers actually correct your form. One of the best memberships I have had.'
      ],
      4: [
        'Solid equipment and a good mix of classes. The evening crowd can get busy, but mornings are quiet and clean. Wish the changing rooms were a bit bigger, but that is minor. Overall a great place to train.'
      ],
      3: [
        'The gym has the basics and the equipment is well maintained. It gets crowded after 6 pm and you can wait for machines. Trainers are helpful when asked. A workable option if your timing is flexible.'
      ]
    }
  },

  bakery: {
    guide: [
      'Mention baked-fresh timing, taste, variety, and whether items sell out.',
      'Specifics: a warm croissant, a soft cake, a crusty loaf.',
      'Keep it short and sensory.'
    ],
    exemplars: {
      5: [
        'The croissants come out of the oven around noon and they are worth planning your day around. Flaky, buttery, and genuinely fresh. The staff even warm your pastry without being asked. Easily the best bakery in the area.'
      ],
      4: [
        'Good bread and nice variety. The sourdough was crusty and fresh in the morning. Prices are a little on the higher side, but the quality shows. I usually pick up a loaf on the weekend.'
      ],
      3: [
        'The pastries are decent and reasonably priced. A couple of items can sell out early and the display could be better labelled. Fresh bread in the morning is the highlight. Worth a visit if you are nearby.'
      ]
    }
  },

  pharmacy: {
    guide: [
      'Mention availability of medicines, pharmacist guidance, and wait times.',
      'Trust and accurate advice matter most.',
      'Keep it calm and helpful.'
    ],
    exemplars: {
      5: [
        'The pharmacist actually explained how to take the medicine properly instead of just handing it over. Most of what I needed was in stock and the queue moved fast. A reliable place when you need something urgently.'
      ],
      4: [
        'Well stocked and the staff are knowledgeable. The pharmacist recommended a cheaper alternative to what I asked for and it worked just fine. Slight wait at peak hours, but worth it for peace of mind.'
      ],
      3: [
        'Decent pharmacy with good availability of common medicines. The staff were polite but a little rushed during the evening rush. Reasonable prices. Gets the job done for everyday needs.'
      ]
    }
  },

  garage: {
    guide: [
      'Mention honesty about repairs, quoted vs final price, turnaround time.',
      'Trust and transparency are the core themes.',
      'Faults are framed as "hope they sort X out".'
    ],
    exemplars: {
      5: [
        'My car had a strange noise and they diagnosed it honestly instead of replacing parts unnecessarily. Charged exactly what they quoted and finished a day early. This is the first garage I have trusted in years.'
      ],
      4: [
        'Quick service and fair pricing for the brake work I needed. They called to explain before doing anything extra, which I appreciated. Slight delay on pickup because they were busy, but they communicated that too.'
      ],
      3: [
        'The work was done correctly and the price was reasonable. It took a little longer than promised and there was no update in between. A decent local garage, though communication could be better.'
      ]
    }
  },

  tailoring: {
    guide: [
      'Mention fit, finishing, turnaround, and price honesty.',
      'Precision and keeping promises matter.'
    ],
    exemplars: {
      5: [
        'Got a blazer altered here and the fit came out better than the original. They even finished the hem a day early. Fair pricing for the kind of hand-finishing they do. My go-to tailor from now on.'
      ],
      4: [
        'Clean stitching and a reasonable turnaround for my trousers. The measurements were spot on. Slightly expensive for a simple hem, but the quality showed. Will go back for bigger alterations.'
      ],
      3: [
        'The alteration was mostly fine, though the hem came back a touch uneven in one spot. The staff were helpful when I pointed it out and fixed it quickly. Decent workmanship at a fair price.'
      ]
    }
  },

  laundry: {
    guide: [
      'Mention cleanliness, smell, timing, and whether items came back complete.',
      'Care with clothes is the trust theme.'
    ],
    exemplars: {
      5: [
        'Sent a load of shirts and they came back folded perfectly, smelling fresh and with every single button intact. They even returned on time on a rainy day. Reliable and careful, which is rare.'
      ],
      4: [
        'Good service overall. Clothes were clean and neatly folded, and pickup/delivery was punctual. One shirt had a small stain remaining, but they washed it again at no charge. Impressed with the follow-up.'
      ],
      3: [
        'Clothes came back clean and on time. One item was slightly damp, so I had to air it again. Reasonable prices. Services are fine for everyday laundry.'
      ]
    }
  },

  taxi: {
    guide: [
      'Mention punctuality, driver courtesy, route honesty, cleanliness.',
      'Time and fair pricing are the themes.'
    ],
    exemplars: {
      5: [
        'Booked a ride for an early flight and the driver arrived ten minutes early, helped with the luggage, and took the fastest route without any detour talk. Clean car, steady driving. My go-to for airport trips now.'
      ],
      4: [
        'Punctual pickup and a courteous driver. The car was clean and the AC worked well. The fare matched the estimate. Minor wait at pickup because of traffic, but the driver communicated. Good, reliable service.'
      ],
      3: [
        'The ride was fine and the driver was polite, though the car could use a little more upkeep. Took a slightly longer route than needed. Reasonable fare at the end. Acceptable for a quick commute.'
      ]
    }
  },

  tuition: {
    guide: [
      'Mention teaching clarity, small class size, staff attentiveness, results.',
      'Progress and encouragement are the core themes.',
      'Constructive low stars focus on communication.'
    ],
    exemplars: {
      5: [
        'Tuition classes here are genuinely helpful. The teacher explains concepts patiently and my son went from struggling with maths to scoring well on his last test. Small batches mean real attention. Money well spent.'
      ],
      4: [
        'Good coaching with structured notes and regular tests. The teacher gave my daughter personalised feedback after every mock. The only drawback is the late-evening batch timing. Results improved noticeably.'
      ],
      3: [
        'The teaching is decent and the fees are reasonable. Communication from the office could be better regarding schedule changes. My nephew improved in the subjects he was weak in. A fair option.'
      ]
    }
  },

  clinic: {
    guide: [
      'Mention doctor attentiveness, wait times, cleanliness, billing clarity.',
      'Care and communication trump everything.'
    ],
    exemplars: {
      5: [
        'The doctor spent a full twenty minutes listening before recommending anything, which is rare these days. The clinic was clean and the staff upfront about the charges. Left feeling heard and with a clear plan.'
      ],
      4: [
        'Professional consultation and clear advice. The doctor explained the options without pressure and the follow-up instructions were easy to follow. Waiting can be a bit long on weekends, but the care is worth it.'
      ],
      3: [
        'The consultation was fine and the doctor was knowledgeable. The wait ran long and the billing counter was a bit confusing. Clean premises and polite staff. A decent option with a little patience.'
      ]
    }
  },

  bike_repair: {
    guide: [
      'Mention honest diagnosis, spare parts availability, turnaround.',
      'Fair quotes without hidden costs are the theme.'
    ],
    exemplars: {
      5: [
        'My bike had been struggling to start and they found the real issue on the first attempt instead of swapping parts blindly. Fixed it in a day at a fair price and even washed the bike before handing it over. Great service.'
      ],
      4: [
        'Genuine parts and a clear estimate before any work began. The bike was ready on time. Only small thing is the waiting area gets crowded. Solid, honest mechanic.'
      ],
      3: [
        'The repair was done correctly and the bike runs smoothly now. It took longer than the estimated time. Fair pricing, though it would help if they called with updates. A satisfactory job overall.'
      ]
    }
  },

  generic: {
    guide: [
      'Short, specific, human. Lead with the standout moment.',
      'Never invent facts; use only details from the user notes.',
      'Low ratings start calm, acknowledge one issue, then pivot positive.'
    ],
    exemplars: {
      5: [
        'Everything about this place was a pleasant surprise. The team was attentive, the quality was clearly a priority, and I left genuinely happy. Already thinking about when I can come back.',
        'Excellent experience from start to finish. Even on a busy day the staff stayed friendly and the result spoke for itself. This is exactly the kind of service worth recommending.'
      ],
      4: [
        'Happy with the visit overall. The staff were polite, the place was clean, and the service was decent. One tiny thing could be smoother, but nothing that would stop me from returning.',
        'Solid experience without any fuss. Got what I needed, the pricing felt fair, and the team was courteous. Would not hesitate to come back when I am in the area.'
      ],
      3: [
        'A fairly average experience. What was good was genuinely good, but a couple of things could be smoother. The people here seem to mean well. Would consider coming back if the small issues improve.',
        'Decent for what it is. It did the job, and the staff were fine. A few rough edges keep it from being great, but it is not far off.'
      ],
      2: [
        'Mixed experience. One thing did not go as expected, but the staff tried their best to make up for it. There is clearly potential here. I hope the small issues get sorted, because the basics are in place.'
      ],
      1: [
        'The experience fell short of expectations, which was frustrating. To their credit, the staff acknowledged it and tried to help. I genuinely hope things improve, because the place shows potential.'
      ]
    }
  }
};

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
function writeTypeFile(typeKey, typeData) {
  const lines = [];
  for (const g of typeData.guide || []) {
    lines.push(JSON.stringify({ role: 'guide', type: typeKey, text: g }));
  }
  for (const tier of Object.keys(typeData.exemplars).sort()) {
    for (const text of typeData.exemplars[tier]) {
      lines.push(JSON.stringify({
        role: 'exemplar', type: typeKey, rating: Number(tier), text: text.trim()
      }));
    }
  }
  const file = path.join(OUT, typeKey + '.jsonl');
  fs.writeFileSync(file, lines.join('\n') + '\n');
  return { file, count: lines.length, exemplars: lines.filter(l => l.includes('"role":"exemplar"')).length };
}

function build(checkOnly = false) {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  const rows = [];
  for (const key of Object.keys(TYPES)) {
    rows.push(writeTypeFile(key, TYPES[key]));
  }
  return rows;
}

if (require.main === module) {
  const checkOnly = process.argv.includes('--check');
  const rows = build(checkOnly);
  const totalRecs = rows.reduce((a, r) => a + r.count, 0);
  const totalB = rows.reduce((a, r) => a + fs.statSync(r.file).size, 0);
  console.log('Seed corpus ready: ' + rows.length + ' types, ' + totalRecs + ' records, ' + (totalB / 1024).toFixed(1) + ' KB');
  for (const r of rows) console.log('  ' + path.basename(r.file) + '  (' + r.count + ' lines, ' + r.exemplars + ' exemplars)');
  if (checkOnly) process.exit(0);
}

module.exports = { build, TYPES };