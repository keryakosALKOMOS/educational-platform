# Educational Video Platform

A complete, responsive, multi-language (Arabic/English) educational platform built with Node.js, Express, SQLite, and vanilla HTML/CSS/JS.

## Features
- **3 Grades**: Dedicated pages for Grade 1, 2, and 3.
- **Video Storage System**: Reads videos dynamically from `videos/grade1`, `videos/grade2`, `videos/grade3`.
- **Student Registration**: Accounts with a coin-based economy.
- **Video Unlocking System**: 1 video costs 1 coin. Tracks unlocked videos.
- **Secure Video Streaming**: Videos stream using HTTP Range Requests. Direct URLs are blocked, and downloads are disabled.
- **Code Redemption**: Admins generate 500 unique codes at a time. Students redeem these codes to earn coins. Rate-limiting is enabled to prevent brute force guessing.
- **Admin Dashboard**: Generate codes, view usage stats, and print remaining codes on a clean A4 grid.
- **Multi-Language (RTL/LTR)**: Fully localized in Arabic and English, seamlessly switching UI layout based on language selection.
- **Responsive UI**: Glassmorphism aesthetic with modern typography and animations, fully optimized for Mobile, Tablet, and Desktop.
- **Progress Tracking**: Saves last watched position for logged-in students.

---

## 🚀 How to Run Locally

### Prerequisites
- Node.js installed (v16+ recommended)

### Setup Steps
1. **Open the project folder**:
   ```bash
   cd d:/educational_Web
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Add Videos**:
   Place your `.mp4` or `.mkv` videos directly in the corresponding folder:
   - `videos/grade1/`
   - `videos/grade2/`
   - `videos/grade3/`

4. **Start the server**:
   ```bash
   node server.js
   ```

5. **Open in Browser**:
   Visit `http://localhost:3000`

### Default Admin Account
- **Email**: `admin@admin.com`
- **Password**: `adminpassword`
*(The first time you start the server, this account is generated automatically).*

---

## 🌐 How to Deploy to a Hosting Platform (VPS / Render / DigitalOcean)

The platform uses SQLite, meaning the database is stored as a file (`db/database.sqlite`). For platforms with ephemeral storage (like Heroku or Render free tier), your database and uploaded videos might reset on restart. 

**Recommended: Use a VPS (like DigitalOcean, Linode, AWS EC2, or Hetzner).**

1. **Upload your code** to the server (via Git or SFTP).
2. **Install Node.js** on the server.
3. Run `npm install` inside the project folder.
4. Set your production environment variables. Create a `.env` file:
   ```env
   PORT=80
   JWT_SECRET=your_super_secret_random_string
   ADMIN_EMAIL=your_real_admin@domain.com
   ADMIN_PASSWORD=your_secure_password
   ```
5. **Keep the app running**:
   Use a process manager like **PM2**:
   ```bash
   npm install -g pm2
   pm2 start server.js --name "edu-platform"
   pm2 save
   pm2 startup
   ```
6. **Domain & SSL**:
   Set up Nginx as a reverse proxy to map your domain to port 3000 (or whichever port you chose), and use Certbot for an HTTPS SSL certificate.

## Security Considerations for Production
- Change the `JWT_SECRET` in the `.env` file to a long random hexadecimal string.
- If using Nginx, configure `client_max_body_size` if you plan to build video uploading functionality later. 
- Ensure the `db/` and `videos/` folders have read/write permissions for the Node.js process user.
