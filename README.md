🚀 Digital Wallet & Payment System
End-to-End MERN + DevOps Production Project

A production-ready digital wallet application built using the MERN stack and deployed with a complete DevOps lifecycle.
This project demonstrates real-world DevOps engineering practices including Docker, Kubernetes, Jenkins CI/CD, AWS Cloud, and Terraform (Infrastructure as Code).

🎯 Goal: Build, deploy, scale, and manage a real payment system using modern DevOps tools — not just run containers.

🧠 Project Highlights (DevOps-Focused)

✅ MERN stack application with real payment gateways
✅ Fully containerized using Docker
✅ Kubernetes orchestration (Deployments, Services, Ingress, Secrets)
✅ Jenkins CI/CD pipeline deploying directly to Kubernetes
✅ Cloud deployment on AWS
✅ Infrastructure provisioned using Terraform (IaC)
✅ Production-grade security, scalability, and automation

🏗️ End-to-End DevOps Architecture

Workflow:

Developer
   ↓
GitHub
   ↓
Jenkins CI/CD
   ↓
Docker Build & Push
   ↓
Kubernetes (EKS)
   ↓
AWS Cloud (Load Balanced)

DevOps Toolchain
Layer	Tools
Source Control	GitHub
CI/CD	Jenkins
Containerization	Docker
Orchestration	Kubernetes
Cloud	AWS (EC2, EKS, S3, IAM, ALB)
Infrastructure as Code	Terraform
Reverse Proxy	Nginx
Security	Secrets, IAM, Env-based configs
🚀 Features
User Features

Secure Authentication (JWT + OTP)

Add Money (Razorpay / Stripe)

Send Money (Instant wallet transfers)

QR Code Payments

Transaction History & Filters

Real-time Notifications (Socket.io)

Profile & Security Management

Admin Features

Dashboard Analytics

User & Transaction Management

Platform-wide Monitoring

Fraud & Account Controls

Technical Features

Real-time WebSocket updates

Mobile-first responsive UI

Secure APIs with validation & rate limiting

Scalable microservices-ready architecture

Full DevOps automation & cloud deployment

🛠 Tech Stack
Frontend

React.js 18

Tailwind CSS

Socket.io Client

React Router

Axios

QR Code Generator & Scanner

Backend

Node.js & Express

MongoDB & Mongoose

JWT Authentication

bcrypt Password Hashing

Razorpay / Stripe

Nodemailer

Socket.io

DevOps & Cloud

Docker & Docker Compose

Kubernetes (Deployments, Services, Ingress)

Jenkins CI/CD

AWS (EC2, EKS, IAM, S3, Load Balancer)

Terraform (Infrastructure as Code)

Nginx Reverse Proxy

📦 Kubernetes Deployment (NEW 🔥)

Docker Compose has been replaced with production-grade Kubernetes manifests.

Kubernetes Resources Used

Deployments – frontend, backend, MongoDB

Services

ClusterIP (internal)

NodePort / Ingress (external)

Ingress Controller

Nginx Ingress for traffic routing

ConfigMaps

Environment variables

Secrets

JWT secrets

Database credentials

Kubernetes Folder Structure
k8s/
 ├── frontend-deployment.yaml
 ├── backend-deployment.yaml
 ├── mongo-deployment.yaml
 ├── services.yaml
 ├── ingress.yaml


📌 Interview Line:

“I deployed a containerized MERN application on Kubernetes using Deployments, Services, Ingress, ConfigMaps, and Secrets.”

🔁 Jenkins CI/CD Pipeline (Production-Grade)

Jenkins automates the entire CI/CD lifecycle, from code commit to Kubernetes deployment.

Pipeline Stages

✔ Code Checkout
✔ Application Build
✔ Automated Tests
✔ Docker Image Build
✔ Docker Image Push (Docker Hub / ECR)
✔ Kubernetes Deployment via kubectl

Checkout → Build → Test → Docker Build → Docker Push → K8s Deploy


📌 Interview Line:

“I built a Jenkins CI/CD pipeline that automatically deploys applications to Kubernetes.”

☁️ Cloud Deployment (AWS)
AWS Services Used

EC2 – Jenkins server

EKS – Kubernetes cluster

S3 – Frontend build storage

IAM – Secure access management

ALB / NLB – Load balancing

The system is cloud-native and horizontally scalable.

🏗️ Infrastructure as Code (Terraform 🔥)

All infrastructure is provisioned automatically using Terraform.

Terraform Manages

EC2 instances

Security groups

Load balancers

Kubernetes cluster (EKS)

Terraform Structure
terraform/
 ├── main.tf
 ├── variables.tf
 ├── outputs.tf


🏆 Interview GOLD Line:

“I provisioned AWS infrastructure using Terraform and deployed applications via Jenkins CI/CD.”

📁 Project Structure
digital-wallet/
├── backend/
├── frontend/
├── k8s/                 # Kubernetes manifests
├── terraform/           # Infrastructure as Code
├── docker-compose.yml
├── Jenkinsfile
└── README.md

🔐 Security Features

JWT with refresh token rotation

Password hashing using bcrypt

Kubernetes Secrets for credentials

Rate limiting & input validation

CORS & Helmet security headers

HTTPS via Nginx (production)

IAM-based AWS access

🧪 Testing
Demo Credentials
Admin:
admin@example.com / password123

User:
demo@example.com / password123

Razorpay Test Cards
Success: 4111 1111 1111 1111
Failure: 4000 0000 0000 0002

🚀 Deployment Summary

Local: Docker / Docker Compose

Production: Kubernetes (AWS EKS)

CI/CD: Jenkins

Infrastructure: Terraform
