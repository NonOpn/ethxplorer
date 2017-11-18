//NOTE THIS PROJECT IS FOR NOW... COMPLETELY PRE-ALPHA :)

const Blocks = require("./blocks.js");
const server = require("./server.js");

const Provider = require("./provider/etherscan_provider");

const blocks = new Blocks(new Provider());


blocks.getLastBlockManaged()
.then(last_block => {
  blocks.start(5, last_block);
})
.catch(err => {
  console.log(err);
})
