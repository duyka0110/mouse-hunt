# Mouse Hunt

## Local play

`npm start` — open the printed `http://<LAN-IP>:3000` on two devices; one **Create room**, other **Join** with the code.
Player 1 can choose `Square` or `Hexagon (radius 2)` in the `Grid` dropdown before creating the room.

## Public deploy (example)

Target domain: `https://mousehunt.tuanhm.me/`

1. Install dependencies and test locally:
   - `npm install`
   - `npm start`
2. Start the Node app in the background on your server (example with PM2):
   - `npm install -g pm2`
   - `pm2 start ecosystem.config.js`
3. Put Nginx in front with TLS, proxying both HTTP and WebSocket to the app:
   - Copy `nginx.mousehunt.example.conf` into your Nginx `sites-available/` folder
   - Adjust certificate paths / domain if needed
   - Enable the site and reload Nginx: `nginx -t && sudo systemctl reload nginx`

The client already connects to `/ws` on the current origin, so no code changes
are required for WebSocket URLs when you serve this at `https://mousehunt.tuanhm.me/`.

