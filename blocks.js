
const config = require("./configs/blocks.js"),
EventEmitter = require("events").EventEmitter,
ethereum_transaction = require("./model/ethereum_transaction_mysql_explode"),
ethereum_address = require("./model/ethereum_address_mysql");

//it is considered safe to have at least 12 blocks after a given
//block to prevent that the fetched block is a forked block
const SAFE_BLOCK_DELTA_HEIGHT = 12;

//constructor
function Blocks(provider, prefix = "") {
  this._last_sync_ok = false;
  this._provider = provider;
  this._prefix = prefix || "";
  this._is_started = false;
  this._speedup = config.speedup;
  this._is_in_event = false;
  this._internal_event = new EventEmitter();
  this.init();
}

Blocks.prototype.init = function() {
  const finish = (current_block_number, end_block_number) => {
    first_block = current_block_number;
    this._is_started = false;
  }

  this._internal_event.on("current_batch", (current_block_number, end_block_number) => {
    if(!this._is_in_event) {
      this._is_in_event = true;
      if(current_block_number >= end_block_number) {
        this._is_in_event = false;
        finish(current_block_number, end_block_number);
        return;
      }

      this.manageTransactionsForBlocks(current_block_number, end_block_number)
      .then(last_block_managed => {
        this._is_in_event = false;
        this._internal_event.emit("current_batch", last_block_managed, end_block_number);
      })
      .catch(e => {
        this._is_in_event = false;
        console.log(e);
      });
    }
  });
}

Blocks.prototype.getLastBlockManaged = function() {
  return new Promise((resolve, reject) => {
    console.log("getLastBlockManaged");
    ethereum_transaction.lastBlockNumber()
    .then(lastBlockNumber => {
      //since it was ok, load next block...
      if(this._last_sync_ok) lastBlockNumber ++;
      console.log(lastBlockNumber);
      if(lastBlockNumber < 46000) lastBlockNumber = 46000;
      resolve(lastBlockNumber);
    })
    .catch(err => {
    });
  });
}

Blocks.prototype.start = function(retry_every_seconds) {
  setInterval(() => {
    if(!this.isStarted()) {
      this._is_started = true;
      this.getLastBlockManaged()
      .then(last_block => {
        this.internalStart(last_block);
      })
      .catch(err => {
        console.log(err);
      })
    }
  }, retry_every_seconds * 1000);
}

Blocks.prototype.isStarted = function() {
  return this._is_started;
}

Blocks.prototype.internalStart = function(first_block, force) {
  this._is_started = true;
  var can_start = false;

  ethereum_address.canSync()
  .then(as_api_sync => {
    can_start = as_api_sync;
    if(!can_start) {
      this._is_started = false;
      return false;
    }

    return this._provider.getBlockNumber();
  })
  .then(blockNumber => {
    if(can_start) {
      this._is_started = false;
      console.log("blockNumber", blockNumber+" "+can_start);
      blockNumber -= SAFE_BLOCK_DELTA_HEIGHT;
      if(first_block + 10000 < blockNumber) {
        blockNumber = first_block + 10000;
      }

      this._internal_event.emit("current_batch", first_block, blockNumber);
    }
  })
  .catch(err => {
    this._is_started = false;
    console.log(err);
  });
}

Blocks.prototype.fetchBlockRetrieveTransactions = function(block_number, end) {
  return new Promise((resolve, reject) => {

    this.fetchBlock(block_number)
    .then(block => {
      if (block && block.transactions && block.transactions.length > 0) {
        const promises = [];

        block.transactions.forEach(tx => {
          promises.push(ethereum_transaction.toJson(tx));
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
    .then(block => {
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
    var whole_start = process.hrtime();
    console.log(`from #${startBlockNumber} to #${endBlockNumber} :: light? ${ethereum_transaction.isLight()}`);
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
        var hrstart = process.hrtime();


        const output = {
          tables: [],
          array: []
        };

        const callback = (i) => {
          if(i < arraysOrBlockTransactions.length) {
            const block = arraysOrBlockTransactions[i].block;
            const transactions = arraysOrBlockTransactions[i].transactions;

            ethereum_transaction.getMergeable(transactions, block)
            .then(object => {
              object.tables.forEach(table => {
                if(!output.array[table]) {
                  output.array[table] = [];
                  output.tables.push(table);
                }
                object.array[table].forEach(transaction => {
                  output.array[table].push(transaction);
                })
              });

              callback(i+1);
            })
            .catch(err => {
              this._last_sync_ok = false;
              reject(err);
            })
          } else {
            ethereum_transaction.saveMergeable(output)
            .then(result => {
              const factor = 1000000;
              const retr_end = process.hrtime(whole_start);
              const save_end = process.hrtime(hrstart);
              const whole_out = retr_end[0]+"."+Math.floor(retr_end[1]/factor);
              const save_out = save_end[0]+"."+Math.floor(save_end[1]/factor);

              console.log(`finished ${whole_out} / ${save_out}`);
              this._last_sync_ok = true;
              resolve(startBlockNumber);
            })
            .catch(err => {
              console.log(err);
            })
          }
        }

        callback(0);
      })
      .catch(err => {
        this._last_sync_ok = false;
        console.log("restarting in 10s....", err ? err.toString() : "error");
        setTimeout(() => { resolve(begin_block); }, 10000);
      })
    } else {
      resolve(startBlockNumber);
    }
  });
}

module.exports = Blocks;
