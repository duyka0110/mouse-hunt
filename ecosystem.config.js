module.exports = {
  apps: [
    {
      name: "mouse-hunt",
      script: "server.js",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
    },
  ],
};

