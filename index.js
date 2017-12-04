//NOTE THIS PROJECT IS FOR NOW... COMPLETELY PRE-ALPHA :)

const DatabaseConnection = require("./database/init");
const Blocks = require("./blocks.js");
const Server = require("./server.js");
const Wait = require("./wait.js");
const MQTT = require("./mqtt.js");

const Provider = require("./provider/json_rpc_provider");
//const Provider = require("./provider/etherscan_provider");
//const Provider = require("./provider/web3_provider");

const mqtt = new MQTT();
const blocks = new Blocks(new Provider(), mqtt);
const server = new Server();

Wait.wait(10)
.then(() => { return DatabaseConnection.init() })
.then(results => {
  console.log("database opened");
  mqtt.start();
  blocks.start(5);

  server.start();
})
.catch(err => {
  console.log(err);
})
