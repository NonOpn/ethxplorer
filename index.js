//NOTE THIS PROJECT IS FOR NOW... COMPLETELY PRE-ALPHA :)

const Blocks = require("./blocks.js");

const blocks = new Blocks();


blocks.getLastBlockManaged()
.then(last_block => {
  blocks.start(5, last_block);
})
.catch(err => {
  console.log(err);
})
