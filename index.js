//NOTE THIS PROJECT IS FOR NOW... COMPLETELY PRE-ALPHA :)

const DatabaseConnection = require("./database/init");
const Blocks = require("./blocks.js");
const Server = require("./server.js");

const Provider = require("./provider/etherscan_provider");

const blocks = new Blocks(new Provider());
const server = new Server();

DatabaseConnection.init()
.then(results => {
  console.log("database opened");
  blocks.start(5);

  server.start();
})
.catch(err => {
  console.log(err);
})
