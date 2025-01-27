import { breedSlimes } from "../sql-services/slime";
import "@aws-sdk/crc64-nvme-crt";
require("@aws-sdk/crc64-nvme-crt");

async function main() {
    await breedSlimes(36, 37);
}

main();