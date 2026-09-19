# Production Deployment Strategy

This guide details two proven deployment strategies to ship the entire PulsePoll stack (React frontend, Go Gin backend, MongoDB, and Redis Pub/Sub) to a **live, publicly reachable URL** with automatic HTTPS/TLS and WebSocket support.

---

## Strategy Overview

| Component | Strategy A: Managed PaaS (Recommended) | Strategy B: Single Cloud VPS (Self-Hosted) |
| :--- | :--- | :--- |
| **Frontend** | Cloudflare Pages / Vercel / Render | Docker container behind Caddy Proxy |
| **Backend** | Render / Fly.io / Railway (Docker Web Service) | Docker container on VPS |
| **MongoDB** | MongoDB Atlas (Free M0 or Dedicated) | MongoDB container with persistent volume |
| **Redis Broker** | Upstash Redis or Redis Cloud | Redis container with persistent volume |
| **TLS/SSL** | Managed automatically by PaaS (Cloudflare/Let's Encrypt) | Automatic HTTPS via Caddy server |
| **Operational Overhead** | Near Zero (No OS patching) | Low (Single VPS maintenance) |

---

## Strategy A: Managed PaaS Deployment (Recommended)

This strategy provides zero-downtime deployments, global CDN distribution, and managed database backups.

### Step 1: Provision Managed Databases

#### 1. MongoDB Atlas
1. Sign up at [mongodb.com/atlas](https://www.mongodb.com/atlas).
2. Create a free shared cluster (`M0 Sandbox` in your closest region).
3. Under **Database Access**, create a user (e.g. `pulsepoll_user`) with a strong password.
4. Under **Network Access**, add IP `0.0.0.0/0` (allow access from anywhere) or bind specifically to your PaaS outbound IPs.
5. Click **Connect** -> **Drivers** (Go) to obtain the connection URI:
   ```env
   MONGO_URI=mongodb+srv://pulsepoll_user:<password>@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority
   MONGO_DB=polling_prod
   ```

#### 2. Redis Cloud or Upstash Redis
1. Sign up at [upstash.com](https://upstash.com) or [redis.com](https://redis.com).
2. Create a Redis database instance.
3. Obtain the connection endpoint:
   ```env
   REDIS_ADDR=us1-flowing-parrot-12345.upstash.io:6379
   REDIS_PASSWORD=AXxxxxYourSecurePasswordxxxx
   ```

---

### Step 2: Deploy Go Backend (Render / Railway / Fly.io)

Using **Render** as an example:
1. Create a [Render](https://render.com) account and click **New +** -> **Web Service**.
2. Connect your Git repository.
3. Configure the service:
   - **Root Directory**: `backend`
   - **Environment**: `Docker`
   - **Region**: Same region as your MongoDB Atlas cluster (e.g. `Oregon (US West)` or `Frankfurt (EU)`)
   - **Plan**: Free or Starter ($7/mo)
4. Set Environment Variables in Render Dashboard:
   ```env
   PORT=8080
   GIN_MODE=release
   MONGO_URI=mongodb+srv://pulsepoll_user:<password>@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority
   MONGO_DB=polling_prod
   REDIS_ADDR=us1-flowing-parrot-12345.upstash.io:6379
   REDIS_PASSWORD=AXxxxxYourSecurePasswordxxxx
   JWT_SECRET=use-a-random-64-character-production-secret-key-here
   CORS_ORIGIN=https://pulsepoll.yourdomain.com
   ```
5. Click **Create Web Service**. Render will build the Go Docker image, deploy it, and provide a live public HTTPS URL:
   - Example: `https://pulsepoll-api.onrender.com`
   - WebSocket URL automatically available at `wss://pulsepoll-api.onrender.com/ws/polls/:id`

---

### Step 3: Deploy React Frontend (Vercel / Cloudflare Pages)

Using **Cloudflare Pages** or **Vercel**:
1. Connect your Git repository.
2. Build Settings:
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
3. Environment Variables:
   ```env
   VITE_API_URL=https://pulsepoll-api.onrender.com
   VITE_WS_URL=wss://pulsepoll-api.onrender.com
   ```
4. Deploy: Cloudflare Pages / Vercel will build and assign a global CDN URL (e.g., `https://pulsepoll.pages.dev`).
5. Custom Domain: Point your domain (e.g., `poll.yourcompany.com`) via CNAME with free automatic SSL.

---

## Strategy B: VPS Deployment via Docker Compose & Caddy

For self-hosting on an AWS EC2 instance, DigitalOcean Droplet ($6/mo), or Hetzner VPS:

### Step 1: VPS Initial Setup
1. Launch an **Ubuntu 24.04 LTS** virtual machine.
2. Point your DNS records to the VPS public IP:
   - `poll.yourdomain.com` -> `A Record` -> `YOUR_SERVER_IP`
3. SSH into the server and install Docker:
   ```bash
   ssh root@YOUR_SERVER_IP
   apt update && apt upgrade -y
   curl -fsSL https://get.docker.com -o get-docker.sh && sh get-docker.sh
   apt install -y docker-compose-plugin
   ```

### Step 2: Configure Production Docker Compose & Caddy
In your server directory `/opt/pulsepoll`:
```bash
git clone https://github.com/your-org/pulsepoll.git /opt/pulsepoll
cd /opt/pulsepoll
```

Create a production `Caddyfile` for automated TLS:
```caddy
poll.yourdomain.com {
    # Reverse proxy REST API calls to Go backend container
    handle /api/* {
        reverse_proxy backend:8080
    }

    # Reverse proxy WebSocket streaming connections to Go WebSocket hub
    handle /ws/* {
        reverse_proxy backend:8080
    }

    # Serve React frontend
    handle {
        reverse_proxy frontend:80
    }
}
```

Add Caddy to `docker-compose.prod.yml`:
```yaml
services:
  caddy:
    image: caddy:2.8-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    networks:
      - polling_net
    depends_on:
      - frontend
      - backend

volumes:
  caddy_data:
  caddy_config:
```

### Step 3: Launch Production Stack
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```
Caddy will automatically provision a free, auto-renewing Let's Encrypt SSL certificate for `poll.yourdomain.com`.
The entire stack is now live, publicly reachable at `https://poll.yourdomain.com`!

---

## Production Security & Hardening Checklist

1. **JWT Secret Strength**: Generate a cryptographically secure 256-bit string:
   ```bash
   openssl rand -base64 48
   ```
2. **Strict CORS Policy**: Avoid `CORS_ORIGIN=*` in production. Set it explicitly to your public frontend origin (`https://poll.yourdomain.com`).
3. **Database Network Isolation**: Ensure MongoDB and Redis instances reject connections outside your private VPC network or IP whitelist.
4. **WebSocket Connection Limits**: Configure `proxy_read_timeout` and client buffers in Nginx/Caddy to mitigate slowloris connection-exhaustion attacks.
5. **Rate Limiting**: Add a reverse proxy or middleware rate limit on `/api/polls/:id/vote` (e.g. 10 requests per minute per IP) to prevent automated vote stuffing.
