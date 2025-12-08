const anchor = require("@coral-xyz/anchor");

describe("solsurvive", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  it("Is initialized!", async () => {
    // Add your test here.
    const program = anchor.workspace.solsurvive;
    const tx = await program.methods.initialize().rpc();
    console.log("Your transaction signature", tx);
  });
});
