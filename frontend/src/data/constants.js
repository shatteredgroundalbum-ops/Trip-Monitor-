export const US_STATES = [
  { code: "AL", name: "Alabama" }, { code: "AK", name: "Alaska" }, { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" }, { code: "CA", name: "California" }, { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" }, { code: "DE", name: "Delaware" }, { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" }, { code: "HI", name: "Hawaii" }, { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" }, { code: "IN", name: "Indiana" }, { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" }, { code: "KY", name: "Kentucky" }, { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" }, { code: "MD", name: "Maryland" }, { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" }, { code: "MN", name: "Minnesota" }, { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" }, { code: "MT", name: "Montana" }, { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" }, { code: "NH", name: "New Hampshire" }, { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" }, { code: "NY", name: "New York" }, { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" }, { code: "OH", name: "Ohio" }, { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" }, { code: "PA", name: "Pennsylvania" }, { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" }, { code: "SD", name: "South Dakota" }, { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" }, { code: "UT", name: "Utah" }, { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" }, { code: "WA", name: "Washington" }, { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" }, { code: "WY", name: "Wyoming" }, { code: "DC", name: "District of Columbia" },
];

// Major US trucking cities (pre-seed) grouped by state code.
export const SEED_CITIES = {
  CA: ["Los Angeles", "San Francisco", "Sacramento", "Fresno", "Bakersfield", "Riverside", "San Diego", "Oakland", "Ontario", "Stockton"],
  TX: ["Dallas", "Houston", "San Antonio", "Austin", "Fort Worth", "Laredo", "El Paso", "Amarillo", "Lubbock"],
  FL: ["Miami", "Jacksonville", "Orlando", "Tampa", "Lakeland", "Ocala"],
  GA: ["Atlanta", "Savannah", "Macon", "Augusta", "Forest Park"],
  IL: ["Chicago", "Joliet", "Rockford", "Aurora", "Springfield"],
  PA: ["Philadelphia", "Pittsburgh", "Harrisburg", "Allentown", "Scranton"],
  OH: ["Columbus", "Cleveland", "Cincinnati", "Toledo", "Akron"],
  MI: ["Detroit", "Grand Rapids", "Lansing", "Warren"],
  NY: ["New York", "Buffalo", "Rochester", "Syracuse", "Albany"],
  NC: ["Charlotte", "Raleigh", "Greensboro", "Durham", "Winston-Salem"],
  IN: ["Indianapolis", "Fort Wayne", "Gary"],
  TN: ["Nashville", "Memphis", "Knoxville", "Chattanooga"],
  MO: ["St. Louis", "Kansas City", "Springfield"],
  KS: ["Kansas City", "Wichita", "Topeka", "Salina"],
  AZ: ["Phoenix", "Tucson", "Mesa", "Flagstaff"],
  NV: ["Las Vegas", "Reno", "Sparks"],
  WA: ["Seattle", "Tacoma", "Spokane", "Vancouver"],
  OR: ["Portland", "Eugene", "Salem"],
  UT: ["Salt Lake City", "Ogden", "Provo"],
  CO: ["Denver", "Colorado Springs", "Aurora", "Pueblo"],
  NM: ["Albuquerque", "Santa Fe", "Las Cruces"],
  OK: ["Oklahoma City", "Tulsa"],
  AR: ["Little Rock", "Fort Smith"],
  LA: ["New Orleans", "Baton Rouge", "Shreveport"],
  MS: ["Jackson", "Gulfport"],
  AL: ["Birmingham", "Mobile", "Montgomery"],
  KY: ["Louisville", "Lexington"],
  VA: ["Richmond", "Norfolk", "Virginia Beach"],
  WV: ["Charleston", "Huntington"],
  MD: ["Baltimore", "Hagerstown"],
  NJ: ["Newark", "Jersey City"],
  MA: ["Boston", "Worcester", "Springfield"],
  WI: ["Milwaukee", "Madison", "Green Bay"],
  MN: ["Minneapolis", "St. Paul", "Duluth"],
  IA: ["Des Moines", "Davenport", "Cedar Rapids"],
  NE: ["Omaha", "Lincoln"],
  SD: ["Sioux Falls", "Rapid City"],
  ND: ["Fargo", "Bismarck"],
  MT: ["Billings", "Missoula"],
  ID: ["Boise", "Idaho Falls"],
  WY: ["Cheyenne", "Casper"],
  SC: ["Columbia", "Charleston", "Greenville"],
};

// Flat array for "type any city" search.
export const FLAT_CITY_STATES = Object.entries(SEED_CITIES).flatMap(([state, cities]) =>
  cities.map((city) => ({ city, state }))
);

export const EVENT_CODES = [
  { code: "BBT", label: "Begin Bobtail" },
  { code: "LLD", label: "Live Load" },
  { code: "LUL", label: "Live Unload" },
  { code: "HPL", label: "Hook Pre Loaded Trailer" },
  { code: "BMT", label: "Begin Empty" },
  { code: "HMT", label: "Hook Empty Trailer" },
  { code: "DMT", label: "Drop Empty Trailer" },
  { code: "DLT", label: "Drop Loaded Trailer" },
  { code: "DRL", label: "Final Drop Loaded Trailer" },
  { code: "RTP", label: "Route point" },
];

export const TRAILER_TYPES = [
  { code: "QW", label: "Quickway" },
  { code: "KRO", label: "Kroger" },
  { code: "RTI", label: "RTI" },
  { code: "ADV", label: "Advantage" },
  { code: "OTR", label: "Other" },
];

export const TIME_ZONES = [
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Phoenix", "America/Anchorage", "Pacific/Honolulu",
];
