//NOTE THIS PROJECT IS FOR NOW... COMPLETELY PRE-ALPHA :)

const mongoose = require("mongoose"),
config = require("./config.json"),
ethereum_address_tx = require("./model/ethereum_address_tx"),
Web3 = require("web3"),
web3 = new Web3(new Web3.providers.HttpProvider(config.web3)),
LocalStorage = require('node-localstorage').LocalStorage,
localStorage = new LocalStorage("./localstorage");

mongoose.connect(config.mongo);

var db = mongoose.connection;

function getBlock(i) {
  return web3.eth.getBlock(i, true);
}

var startTime = undefined;

function fetchBlock(block_number, end) {
  return new Promise((resolve, reject) => {
    if(block_number < end) {
      startTime = process.hrtime();
      block_count_promise = web3.eth.getBlockTransactionCount(block_number);
      block_count_promise.then(transaction_count => {
        if(transaction_count > 0) {
          var block_promise = web3.eth.getBlock(block_number, true);
          block_promise.then(block => {
            if (block != null && block.transactions != null) {
              const call = (i, saved) => {
                if(i < block.transactions.length) {
                  const transaction = block.transactions[i];
                  ethereum_address_tx.save(transaction)
                  .then((tx) => {
                    if(tx) console.log("1 saved");
                    //call(i+1, (tx != undefined) ? saved+1 : 0);
                  })
                  .catch((e) => {
                  })
                  call(i+1, saved);
                } else {
                  diff = process.hrtime(startTime);
                  console.log(`finish current ${block_number} block == ${i} #${saved} saved ${diff}`);
                  resolve(true);
                }
              }

              call(0, 0);
            } else {
              console.log(`finish current block == no transaction`);
              resolve(true);
            }
          })
          .catch(() => {
            resolve(true);
          });
        } else {
          diff = process.hrtime(startTime);
          console.log(`finish current ${block_number} block skip ${diff}`);
          resolve(true);
        }
      })
      .catch(() => {
        resolve(true);
      });
    } else {
      resolve(false);
    }
  });
}

var save_timer = 100;
const speedup = 5;

function manageTransactionsForBlocks(speedup, startBlockNumber = 0, endBlockNumber = undefined) {
  return new Promise((resolve, reject) => {

    const callback = (endBlockNumber) => {
      console.log("Using endBlockNumber: " + endBlockNumber);

      const call = (i) => {
        if(i < endBlockNumber) {
          var finished = 0;
          const treshold = i + speedup;
          const callback = () => {
            save_timer --;
            if(save_timer <= 0) {
              console.log("saving current block at index of current work block");
              localStorage.setItem("lastBlock", i);
              save_timer = 100;
            }

            if(finished > speedup) {
              console.error(`finished should not inf than 0 ${i} ${finished}`);
            }

            if(finished >= speedup) {
              call(i);
            }
          }

          if(treshold > endBlockNumber) {
            //if we were at X block after last, we add X from the finihed counter
            finished += (treshold - endBlockNumber);
          }

          while(i < endBlockNumber && i < treshold) {
            fetchBlock(i, endBlockNumber)
            .then(() => {
              finished ++;
              callback();
            })
            .catch((err) => {
              console.error(err);
              finished ++;
              callback();
            });
            i++;
          }

        } else {
          console.log("finished call");
          resolve(true);
        }
      }

      call(startBlockNumber);
    }

    if(endBlockNumber) {
      callback(endBlockNumber);
      return;
    }

    web3.eth.getBlockNumber()
    .then((block_number) => {
      endBlockNumber = block_number;

      callback(endBlockNumber);
    })
    .catch(e => {
      reject(e);
    });

  });
}


var lastBlock = localStorage.getItem("lastBlock");


if(!lastBlock) lastBlock = 0;
else lastBlock = parseInt(lastBlock);

//seems that there are no tx before those block...
if(lastBlock < 400000) lastBlock = 400000

console.log(`starting at block ${lastBlock}`);
manageTransactionsForBlocks(speedup, lastBlock)
.then(success => {
  console.log(success);
})
.catch(e => {
  console.log(e);
})
