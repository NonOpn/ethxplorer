
const config = require("./configs/blocks.js"),
EventEmitter = require("events").EventEmitter,
LocalStorage = require("node-localstorage").LocalStorage,
localStorage = new LocalStorage("./localstorage"),
ethereum_transaction = require("./model/ethereum_transaction_mysql"),
web3 = require("./web3/provider");

//it is considered safe to have at least 12 blocks after a given
//block to prevent that the fetched block is a forked block
const SAFE_BLOCK_DELTA_HEIGHT = 12;

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
    this.setLastBlockManaged(first_block);
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
        this.setLastBlockManaged(last_block_managed);
      }
      this._internal_event.emit("current_batch", last_block_managed, end_block_number);
    })
    .catch(e => {
      console.log(e);
    });
  });
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
      blockNumber -= SAFE_BLOCK_DELTA_HEIGHT;
      if(first_block + 100000 < blockNumber) {
        blockNumber = first_block + 100000;
      }
      this._internal_event.emit("current_batch", first_block, blockNumber);
    })
    .catch(err => {
      this._is_started = false;
    });
  }
}

Blocks.prototype.fetchBlockRetrieveTransactions = function(block_number, end) {
  return new Promise((resolve, reject) => {
    const start = process.hrtime();
    var finished = false, canceled = false;
    setTimeout(() => {
      if(!finished) {
        canceled = true;
        reject(`not retrieved for block #${block_number}`);
      }
    }, config.timeout_block);
    web3.eth.getBlock(block_number, true, (err, block) => {
      finished = true;
      if(canceled) {
        return;
      }

      const retrieval = process.hrtime(start);
      try{
        if(block != null){
          if (block.transactions != null && block.transactions.length > 0) {
            const promises = [];

            block.transactions.forEach(transaction => {
              promises.push(ethereum_transaction.filter(transaction));
            });

            Promise.all(promises)
            .then(result => {
              const filtered = [];
              result.forEach(res => {if(res) { filtered.push(res);}});


              resolve({
                block: block,
                transactions: filtered
              });
            })
            .catch(err => {
              console.log(err);
            });
          } else {
            resolve({
              block: block,
              transactions: []
            });
          }
        } else {
          reject(err);
        }
      }catch(e) {
        log(e);
      }
    })
    .catch(err => {
      reject(err);
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
        promises.push(this.fetchBlockRetrieveTransactions(startBlockNumber));
        startBlockNumber++;
      }

      Promise.all(promises)
      .then(arraysOrBlockTransactions => {
        const callback = (i) => {
          if(i < arraysOrBlockTransactions.length) {
            const block = arraysOrBlockTransactions[i].block;
            const transactions = arraysOrBlockTransactions[i].transactions;
            ethereum_transaction.saveMultiple(transactions, block)
            .then(txs => {
              if(txs && txs.length > 0) {
                console.log(`block ${block.number} saved ${transactions.length}`);
              }
              //iterate on the next to save - do not use Promise.all since not sure MySQL save won't be parallel in future
              callback( i + 1 );
            })
            .catch(err => {
              console.log(`block ${block.number} saved ${transactions.length} ERROR`, err);
            });
          } else {
            console.log(`finished`);
            resolve(startBlockNumber);
          }
        }

        callback(0);
      })
      .catch(err => {
        console.log("restarting in 10s....", err ? err.toString() : "error");
        setTimeout(() => { resolve(begin_block); }, 10000);
      })
    } else {
      resolve(startBlockNumber);
    }
  });
}

module.exports = Blocks;
