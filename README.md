# FashionGuard AI

AI-powered platform for protecting fashion designs using invisible digital watermarking and military-grade encryption.

---

## What It Does

FashionGuard AI lets designers upload, encrypt, and watermark their fashion designs. Every file is encrypted with AES-256-GCM before storage. An invisible DCT-based watermark is embedded into the image frequency domain — undetectable to the eye but permanently tied to the original creator. Anyone can upload a suspected copied design and run a 6-step ownership verification to confirm who created it, when, and with what confidence.

---

## Features

- **AES-256-GCM Encryption** — every uploaded file is encrypted at rest
- **Invisible DCT Watermarking** — embeds designer ID and timestamp in image frequency domain
- **Ownership Verification** — 6-step process to extract, decrypt, and confirm watermark ownership
- **Role-Based Access Control** — admin, designer, collaborator, reviewer
- **Design Sharing** — share with view / download / edit permission levels
- **Multi-Factor Authentication** — TOTP-based MFA with backup codes
- **Admin Dashboard** — user management, security logs, activity monitoring

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React, Tailwind CSS, Framer Motion |
| Backend | Node.js, Express.js |
| Database | MongoDB, Mongoose |
| Watermarking | Python, FastAPI, OpenCV, NumPy, SciPy |
| Encryption | AES-256-GCM (Node.js crypto) |
| Auth | JWT, bcryptjs, speakeasy (TOTP) |

---

## How Watermark Verification Works

1. Upload suspected copied design
2. Extract invisible watermark signal (inverse DCT)
3. Decrypt AES-256-GCM payload
4. Retrieve ownership record from database
5. Compare ownership records
6. Confirm original designer — displays Designer ID, timestamp, and confidence score

## Contributing
Pull requests are welcome.
