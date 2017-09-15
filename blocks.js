
const mongoose = require("mongoose"),
config = require("./configs/blocks.json"),
ethereum_address_tx = require("./model/ethereum_address_tx"),
Web3 = require("web3"),
web3 = new Web3(new Web3.providers.HttpProvider(config.web3)),
LocalStorage = require('node-localstorage').LocalStorage,
localStorage = new LocalStorage("./localstorage");

mongoose.connect(config.mongo);

var db = mongoose.connection;

function Blocks(prefix = "") {
  this._prefix = prefix || "";
  this._is_started = false;
  this._save_timer = 100;
  this._start_time = undefined;
  this._speedup = config.speedup;
}


Blocks.prototype.getBlockNumber = function() {
  return web3.eth.getBlockNumber();
}

Blocks.prototype.getLastBlockManaged = function() {
  return new Promise((resolve, reject) => {
    var lastBlock = localStorage.getItem(this._prefix + "lastBlock");

    if(!lastBlock) lastBlock = 0;
    else lastBlock = parseInt(lastBlock);

    //seems that there are no tx before those block...
    if(lastBlock < 400000) lastBlock = 400000

    resolve(lastBlock);
  });
}

Blocks.prototype.start = function(retry_every_seconds, first_block) {
  setInterval(() => {
    this.internalStart(first_block);
  }, 5000);
}


Blocks.prototype.internalStart = function(first_block) {
  if(!this._is_started) {
    this._is_started = true;

    console.log(`starting at block ${first_block}`);

    console.log("starting retrieval now...");
    this.getBlockNumber()
    .then(blockNumber => {
      this.manageTransactionsForBlocks(first_block, blockNumber)
      .then(last_block_managed => {
        console.log(`last block := ${last_block_managed}`);
        first_block = last_block_managed;
        this._speedup = 1;
        this._is_started = false;
      })
      .catch(e => {
        console.log(e);
      });
    });
  }
}

Blocks.prototype.fetchBlock = function(block_number, end) {
  return new Promise((resolve, reject) => {
    try{
      if(block_number < end) {
        this.start_time = process.hrtime();
        console.log(`start  current ${block_number} tx`);
        var block_promise = web3.eth.getBlock(block_number, true);
        block_promise.then(block => {
          if (block != null && block.transactions != null) {
            console.log(`start  current ${block_number} tx == #${block.transactions.length} tx`);
            block.transactions.forEach(transaction => {
              ethereum_address_tx.save(transaction)
              .then((tx) => {
              })
              .catch((e) => {
                console.log(e);
              })
            });
            diff = process.hrtime(this.start_time);
            console.log(`finish current ${block_number} tx == #${block.transactions.length} ${diff}`);
          } else {
            console.log(`finish current block == no transaction`);
          }
          resolve(true);
        })
        .catch((e) => {
          reject(e);
        });
      } else {
        resolve(false);
      }
    }catch(err) {
      reject(err);
    }
  });
}

Blocks.prototype.manageTransactionsForBlocks = function(startBlockNumber, endBlockNumber) {
  return new Promise((resolve, reject) => {
    console.log(`from #${startBlockNumber} to #${endBlockNumber}`);
    const call = () => {
      if(startBlockNumber < endBlockNumber) {
        var promises = [];
        const treshold = startBlockNumber + this._speedup;

        while(startBlockNumber < endBlockNumber && startBlockNumber < treshold) {
          promises.push(this.fetchBlock(startBlockNumber, endBlockNumber))
          startBlockNumber++;
        }

        Promise.all(promises)
        .then(result => {
          this._save_timer -= promises.length;
          if(this._save_timer <= 0) {
            console.log("saving current block at index of current work block");
            localStorage.setItem(this._prefix + "lastBlock", startBlockNumber);
            this._save_timer = 100;
          }
          call();
        })
        .catch(err => {
          console.log(err);
        })
      } else {
        resolve(false);
      }
    }

    call();
  });
}

module.exports = Blocks;
