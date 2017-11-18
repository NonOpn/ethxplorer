const express = require("express"),
router = express.Router(),
ethereum_transaction = require("../model/ethereum_transaction_mysql"),
web3 = require("../web3/provider");

const LIMIT = 1000;

const ERROR_WITH_INPUT = "Error with input";
const ERROR_WITH_ADDRESS = "Error with address";
const MISSING_PARAMS_INPUT = "Missing params input";
const MISSING_PARAMS_ADDRESS = "Missing params address";
const ERROR_WITH_SYNC = "Error with the current server state";

function getTransactionsForAddressFromDesc(req, res, from) {
  const address = req.params.address || undefined;

  if(address && web3.utils.isAddress(address)) {
    ethereum_transaction.withAddressFromId(address, LIMIT, from)
    .then(results => {
      var last_id = undefined;
      results.forEach(result => {
        if(!last_id || result.id < last_id) last_id = result.id;
      })
      res.json({
        last: last_id,
        transactions: results
      });
    })
    .catch(err => {
      console.log(err);
      res.status(500).json({error: ERROR_WITH_ADDRESS, code: -2});
    });
  } else {
    res.json({error: MISSING_PARAMS_ADDRESS, code: -1});
  }
}

router.get("/address/:address/from/desc.json", function(req, res) {
  getTransactionsForAddressFromDesc(req, res);
});

router.get("/address/:address/from/desc/:from.json", function(req, res) {
  const from = req.params.from || undefined;
  if(isNaN(from)) from = 0;
  getTransactionsForAddressFromDesc(req, res, from);
});

router.get("/address/:address.json", function(req, res) {
  const address = req.params.address || undefined;
  var from = parseInt(req.query.from || 0);
  if(isNaN(from)) from = 0;

  if(address && web3.utils.isAddress(address)) {
    ethereum_transaction.withAddress(address, from, LIMIT)
    .then(results => {
      var last_id = 0;
      //for now, assume results could be unordered
      results.forEach(result => {
        if(result.blockNumber > last_id) last_id = result.blockNumber;
      });

      //having the lastBlockNumberPossiblyIncomplete tells that the API
      //can reach the limit before having a whole block transactions
      //simply recall the api with ?from=<lastBlock + 1>
      //TODO switch this to id since now id = <block + nonce>

      if(results.length === LIMIT) {
        results = results.filter(result => { return result.blockNumber != last_id; });
        //new round table... reset the last block to the last complete block retrieved
        last_id = 0;
        results.forEach(result => {
          if(result.blockNumber > last_id) last_id = result.blockNumber;
        });
      }

      res.json({
        lastBlockNumber: last_id,
        transactions: results
      });
    })
    .catch(err => {
      console.log(err);
      res.status(500).json({error: ERROR_WITH_ADDRESS, code: -2});
    });
  } else {
    res.json({error: MISSING_PARAMS_ADDRESS, code: -1});
  }
});

router.get("/tx/match/input/:input.json", function(req, res) {
  const input = req.params.input || undefined;
  var from = parseInt(req.query.from || 0);
  if(isNaN(from)) from = 0;

  if(input && input != "0x") {
    //const input_hex = web3.utils.toHex(input).toLowerCase();
    const input_hex = input.toLowerCase();
    ethereum_transaction.withInput(input_hex, from, LIMIT)
    .then(results => {
      res.json({
        transactions: results
      });
    })
    .catch(err => {
      res.status(500).json({error: ERROR_WITH_INPUT, code: -2});
    });
  } else {
    res.json({error: MISSING_PARAMS_INPUT, code: -1});
  }
});


/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
* Retrieve the current geth or parity node state and the current database
* manager
* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */
router.get("/state.json", function(req, res) {
  //pushing promises corresponding to the different information to retrieve
  console.log(web3.version);
  const promises = [
    ethereum_transaction.count(),
    ethereum_transaction.lastBlockNumber(),
    web3.eth.getBlockNumber(),
    web3.eth.isSyncing(),
    web3.version
  ];

  Promise.all(promises)
  .then(results => {
    if(results && results.length === promises.length) {
      //results is deterministically right
      var result = {
        service: {
          count: results[0],
          blockNumber: results[1]
        },
        blockchain: {
          currentBlock: results[2],
          syncing: results[3],
          version: results[4]
        }
      };

      const syncing = results[3];
      if(syncing) {
        result.blockchain.syncing = true;
        result.blockchain.startingBlock = syncing.startingBlock;
        result.blockchain.currentBlock = syncing.currentBlock;
        result.blockchain.highestBlock = syncing.highestBlock;
      }

      res.status(200).json(result);
    } else {
      throw "Invalid result length, crashing";
    }
  })
  .catch(err => {
    console.log(err);
    res.status(500).json({error: ERROR_WITH_SYNC, code: -1});
  });
});

module.exports = router;
