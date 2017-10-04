const express = require("express"),
router = express.Router(),
ethereum_transaction = require("../model/ethereum_transaction_mysql"),
web3 = require("../web3/provider");

const LIMIT = 1000;

const ERROR_WITH_INPUT = "Error with input";
const ERROR_WITH_ADDRESS = "Error with address";
const MISSING_PARAMS_INPUT = "Missing params input";
const MISSING_PARAMS_ADDRESS = "Missing params address";

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

  if(input && input != "0x") {
    //const input_hex = web3.utils.toHex(input).toLowerCase();
    const input_hex = input.toLowerCase();
    ethereum_transaction.withInput(input_hex)
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

module.exports = router;
