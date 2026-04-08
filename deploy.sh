#!/bin/bash
# Reliable Vercel deploy script
# Vercel free tier fails on repeat deploys to the same project.
# Workaround: delete project, recreate fresh, deploy, set alias.

set -e
cd "$(dirname "$0")"

echo "Building locally..."
npm run build

echo "Removing old Vercel project (if exists)..."
rm -rf .vercel
npx vercel rm masters-pool --yes 2>/dev/null || true

echo "Deploying fresh to Vercel..."
npx vercel --prod --yes --name masters-pool 2>&1 | tee /tmp/vercel-deploy.log

DEPLOY_URL=$(grep -oE 'https://[^ ]+\.vercel\.app' /tmp/vercel-deploy.log | tail -1)
echo ""
echo "Deploy URL: $DEPLOY_URL"

echo "Waiting for deployment to be ready..."
sleep 10

echo "Setting alias to masters-app-rosy.vercel.app..."
for i in 1 2 3 4 5; do
  npx vercel alias "$DEPLOY_URL" masters-app-rosy.vercel.app 2>&1 && break
  echo "Retry $i... waiting 10s"
  sleep 10
done

echo ""
echo "Disconnecting GitHub integration to prevent broken auto-deploys..."
echo "y" | npx vercel git disconnect 2>/dev/null || true

echo ""
echo "Done! Live at: https://masters-app-rosy.vercel.app"
