
const config = require("./configs/blocks.js"),
EventEmitter = require("events").EventEmitter,
ethereum_transaction = require("./model/ethereum_transaction_mysql");
//it is considered safe to have at least 12 blocks after a given
//block to prevent that the fetched block is a forked block
const SAFE_BLOCK_DELTA_HEIGHT = 12;

//constructor
function Blocks(provider, prefix = "") {
  this._provider = provider;
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
    this._is_started = false;
  }

  this._internal_event.on("current_batch", (current_block_number, end_block_number) => {
    if(current_block_number >= end_block_number) {
      finish(current_block_number, end_block_number);
      return;
    }

    this.manageTransactionsForBlocks(current_block_number, end_block_number)
    .then(last_block_managed => {
      this._internal_event.emit("current_batch", last_block_managed, end_block_number);
    })
    .catch(e => {
      console.log(e);
    });
  });
}

Blocks.prototype.getLastBlockManaged = function() {
  return new Promise((resolve, reject) => {
      ethereum_transaction.lastBlockNumber()
      .then(lastBlockNumber => {
        this._last_block = lastBlockNumber;

        if(!this._last_block) this._last_block = 0;
        resolve(this._last_block);
      })
      .catch(err => {

      });
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

    this._provider.getBlockNumber()
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

    this.fetchBlock(block_number)
    .then(block => {
      if (block.transactions != null && block.transactions.length > 0) {
        const promises = [];

        block.transactions.forEach(tx => {
          promises.push(ethereum_transaction.filter(tx));
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
    })
    .catch(err => {
      reject(err);
    });
  });
}

Blocks.prototype.fetchBlock = function(block_number) {
  return new Promise((resolve, reject) => {
    var finished = false, canceled = false;
    setTimeout(() => {
      if(!finished) {
        canceled = true;
        reject(`not retrieved for block #${block_number}`);
      }
    }, config.timeout_block);

    this._provider.getBlock(block_number, true)
    .then((block) => {
      finished = true;
      if(canceled) { return; }
      if(block) resolve(block);
      else reject("invalid block :: still syncing?");
    })
    .catch(err => {
      finished = true;
      if(canceled) { return; }
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
            //block.blockNumber = Number(block.blockNumber);
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
