
const config = require("./configs/blocks.js"),
EventEmitter = require("events").EventEmitter,
LocalStorage = require("node-localstorage").LocalStorage,
localStorage = new LocalStorage("./localstorage"),
ethereum_address_tx = require("./model/ethereum_address_tx_mysql"),
Web3 = require("web3"),
web3 = new Web3(new Web3.providers.HttpProvider(config.web3));

//constructor
function Blocks(prefix = "") {
  this._prefix = prefix || "";
  this._is_started = false;
  this._speedup = config.speedup;
  this._last_block = undefined;
  this._internal_event = new EventEmitter();
  this.init();
}

Blocks.prototype.init = function() {
  const finish = (current_block_number, end_block_number) => {
    first_block = current_block_number;
    this.setLastBlockManaged(first_block - 1);
    this._is_started = false;
  }

  this._internal_event.on("current_batch", (current_block_number, end_block_number) => {
    if(current_block_number >= end_block_number) {
      this.setLastBlockManaged(current_block_number);
      finish(current_block_number, end_block_number);
      return;
    }

    this.manageTransactionsForBlocks(current_block_number, end_block_number)
    .then(last_block_managed => {
      //if 1000 TX was made in the batch, set last block managed to it
      //it does not manage the save EVERY 1000 from the previous batches
      //but only every 10000 in the current batch
      if(last_block_managed - this._last_block > 1000) {
        console.log("saving current block at index of current work block");
        this.setLastBlockManaged(last_block_managed);
      }
      this._internal_event.emit("current_batch", last_block_managed, end_block_number);
    })
    .catch(e => {
      console.log(e);
    });
  })
}

Blocks.prototype.setLastBlockManaged = function(block_number) {
  localStorage.setItem(this._prefix + "lastBlock", block_number);
  this._last_block = block_number;
}

Blocks.prototype.getLastBlockManaged = function() {
  return new Promise((resolve, reject) => {
    if(!this._last_block) {
      this._last_block = localStorage.getItem(this._prefix + "lastBlock");

      if(!this._last_block) this._last_block = 0;
      else this._last_block = parseInt(this._last_block);
    }
    resolve(this._last_block);
  });
}

Blocks.prototype.start = function(retry_every_seconds, first_block) {
  this._last_block = first_block;
  setInterval(() => {
    this.internalStart(this._last_block);
  }, 2000);
}

Blocks.prototype.internalStart = function(first_block) {
  if(!this._is_started) {
    this._is_started = true;

    console.log(`starting at block ${first_block}`);

    web3.eth.getBlockNumber()
    .then(blockNumber => {
      if(first_block + 100000 < blockNumber) {
        blockNumber = first_block + 100000;
      }
      this._internal_event.emit("current_batch", first_block, blockNumber);
    });
  }
}

Blocks.prototype.fetchBlock = function(block_number, end) {
  return new Promise((resolve, reject) => {
    const start = process.hrtime();
    var finished = false, canceled = false;
    setTimeout(() => {
      if(!finished) {
        canceled = true;
        console.log("canceled");
        reject(`not retrieved for block #${block_number}`);
      }
    }, 10000);
    web3.eth.getBlock(block_number, true, (err, block) => {
      finished = true;
      if(canceled) {
        console.log("was canceled");
        return;
      }

      const retrieval = process.hrtime(start);
      try{
        if(block != null){
          if (block.transactions != null && block.transactions.length > 0) {
            const promises = [];

            block.transactions.forEach(transaction => {
              promises.push(ethereum_address_tx.filter(transaction));
            });

            Promise.all(promises)
            .then(result => {
              const filtered = [];
              result.forEach(res => {if(res) { filtered.push(res);}});

              if(filtered.length === 0) {
                resolve(0);
              } else {
                ethereum_address_tx.saveMultiple(filtered, block)
                .then(result => {
                  console.log(`block #${block_number} :${block.transactions.length} :${filtered.length} :${result.length}`);
                  resolve(result.length);
                }).catch(err => {
                  console.log("err");
                  console.log(err);
                })
              }
            })
            .catch(err => {
              console.log(`block #${block_number} :${block.transactions.length} :0`);
              console.log(`#${block_number} error`, err);
            });
          } else {
            resolve(0);
          }
        } else {
          console.log(`#${block_number} finished with an error`);
          reject(err);
        }
      }catch(e) {
        console.log(e);
      }
    });
  });
}

Blocks.prototype.manageTransactionsForBlocks = function(startBlockNumber, endBlockNumber) {
  return new Promise((resolve, reject) => {
    console.log(`from #${startBlockNumber} to #${endBlockNumber}`);
    if(startBlockNumber < endBlockNumber) {
      const begin_block = startBlockNumber;
      const treshold = startBlockNumber + this._speedup;
      const promises = [];

      while(startBlockNumber < endBlockNumber && startBlockNumber < treshold) {
        promises.push(this.fetchBlock(startBlockNumber));
        startBlockNumber++;
      }

      Promise.all(promises)
      .then(result => {
        resolve(startBlockNumber);
      })
      .catch(err => {
        console.log("restarting in 10s....", err);
        setTimeout(() => { resolve(begin_block); }, 10000);
      })
    } else {
      resolve(startBlockNumber);
    }
  });
}

module.exports = Blocks;
