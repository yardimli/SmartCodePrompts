#!/bin/bash
npm install || { echo "npm install failed"; exit 1; }
npm start || { echo "npm start failed"; exit 1; }
