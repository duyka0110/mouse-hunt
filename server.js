const path = require("path");
const express = require("express");
const os = require("os");

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const app = express();

app.use(express.static(path.join(__dirname)));

app.listen(PORT, () => {
  console.log(`http://localhost:${PORT}`);
  const addrs = new Set();
  for (const list of Object.values(os.networkInterfaces())) {
    for (const n of list || []) if (n.family === "IPv4" && !n.internal) addrs.add(n.address);
  }
  for (const addr of addrs) console.log(`  http://${addr}:${PORT}`);
});
