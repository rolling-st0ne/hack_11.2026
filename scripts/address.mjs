import {lanAddresses} from '../server/network.mjs';
const port=Number(process.env.PORT)||3000;
console.log(`На этом Mac: http://localhost:${port}`);
for(const {interface:name,address} of lanAddresses())console.log(`LAN (${name}): http://${address}:${port}`);
