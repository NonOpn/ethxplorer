function UnsafeBlock() {

}

UnsafeBlock.prototype.setBlock = function(blockNumber, block) {
  this.block_number = blockNumber;
  this.block = block;

  if(this.block && this.block.transactions) {
    this.block.transactions.forEach(tx => {
      tx.hash = tx.hash.toLowerCase();
      tx.from = tx.from.toLowerCase();
      tx.to = tx.to.toLowerCase();
    });
  }
}

UnsafeBlock.prototype.getTransactions = function() {
  return this.block ? this.block.transactions;
}

UnsafeBlock.prototype.getTransactionsForAddress = function(address) {
  if(this.block && this.block.transactions) {
    address = address.toLowerCase();
    return this.block.transactions.filter(tx => {
      return tx.from === address || tx.to === address;
    });
  }
}

module.exports = UnsafeBlock;
