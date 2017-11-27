module.exports = {
  from0x: function(string, debug_tx, debug_block_number) {
    const replaced = string.replace("0x","").toLowerCase();
    if(replaced.length > 0) {
      const result = Buffer.from(replaced, "hex").toString("base64");

      console.error(string.length+" "+result.length+" "+debug_tx+" "+debug_block_number);
      return result;
    }

    return "";
  },
  to0x: function(base64) {
    if(base64.length > 0) {
      const string = Buffer.from(base64, "base64").toString("hex");
      return "0x" + string.toLowerCase();
    }
    return "0x";
  }
}
