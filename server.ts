import express, { type Express } from "express";
import app from "./server/index";

// Vercel's Express runtime detects this root-level entrypoint. The imported app
// also owns the existing listener used by the ordinary Node/Render deployment.
const vercelExpressApp: Express = app;
void express;

export default vercelExpressApp;
