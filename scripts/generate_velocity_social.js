const fs = require('fs');

function makeSvg(tier, price){
return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1080" height="1080" viewBox="0 0 1080 1080" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <pattern id="diag" width="24" height="24" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
      <rect width="24" height="24" fill="#0B0B0B"/>
      <rect width="3" height="24" fill="#121212"/>
    </pattern>
  </defs>
  <rect width="1080" height="1080" fill="url(#diag)"/>

  <polygon points="90,92 168,236 196,214 127,109" fill="none" stroke="#8EDB00" stroke-width="14"/>
  <polygon points="180,100 290,154 214,214 190,182" fill="none" stroke="#CDEB80" stroke-width="12"/>

  <text x="320" y="145" fill="#FFFFFF" font-size="66" font-family="Montserrat, Arial, sans-serif" font-weight="700">VELOCITY</text>
  <text x="322" y="205" fill="#A7A9AC" font-size="44" font-family="Inter, Arial, sans-serif" letter-spacing="1">SPORTS</text>

  <rect x="90" y="280" width="470" height="82" rx="16" fill="#131313" stroke="#8EDB00" stroke-width="3"/>
  <text x="120" y="334" fill="#8EDB00" font-size="38" font-family="Montserrat, Arial, sans-serif" font-weight="700">SUMMER MEMBERSHIP</text>

  <text x="90" y="500" fill="#FFFFFF" font-size="92" font-family="Montserrat, Arial, sans-serif" font-weight="700">${tier.toUpperCase()}</text>
  <text x="90" y="640" fill="#8EDB00" font-size="128" font-family="Montserrat, Arial, sans-serif" font-weight="700">$${price}</text>
  <text x="500" y="640" fill="#A7A9AC" font-size="42" font-family="Inter, Arial, sans-serif">/ month</text>

  <circle cx="103" cy="744" r="7" fill="#1F6FB2"/>
  <text x="130" y="753" fill="#FFFFFF" font-size="38" font-family="Inter, Arial, sans-serif">Performance training environment</text>
  <circle cx="103" cy="816" r="7" fill="#1F6FB2"/>
  <text x="130" y="825" fill="#FFFFFF" font-size="38" font-family="Inter, Arial, sans-serif">Data-driven athlete development</text>
  <circle cx="103" cy="888" r="7" fill="#1F6FB2"/>
  <text x="130" y="897" fill="#FFFFFF" font-size="38" font-family="Inter, Arial, sans-serif">See full benefits: velosportsohio.com</text>

  <text x="90" y="986" fill="#8EDB00" font-size="44" font-family="Montserrat, Arial, sans-serif" font-weight="700">JOIN THIS SUMMER</text>
  <text x="530" y="986" fill="#FFFFFF" font-size="40" font-family="Montserrat, Arial, sans-serif" font-weight="700">velosportsohio.com</text>
</svg>`;
}

fs.mkdirSync('public/social', {recursive:true});
fs.writeFileSync('public/social/velocity-basic-79-summer.svg', makeSvg('Basic', '79.00'));
fs.writeFileSync('public/social/velocity-premium-109-summer.svg', makeSvg('Premium', '109'));
console.log('generated');
