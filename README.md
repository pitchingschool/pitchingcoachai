# PitchingCoachAI

Free pitching mechanics analysis tool. Upload a video, get a biomechanical report in 60 seconds.

Built by Mike Grady — Grady's Pitching School, North Canton, OH.

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Set up Supabase
1. Create a project at [supabase.com](https://supabase.com)
2. Go to SQL Editor and paste the contents of `supabase-schema.sql` — click Run
3. Copy your project URL and keys from Settings > API

### 3. Set up Resend (for welcome emails)
1. Sign up at [resend.com](https://resend.com)
2. Add and verify your domain (gradyspitchingschool.com)
3. Create an API key

### 4. Create `.env.local`
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-role-key
RESEND_API_KEY=re_your_api_key
ADMIN_PASSWORD=pick-a-strong-password
```

### 5. Run locally
```bash
npm run dev
```
Open http://localhost:3000

### 6. Deploy to Vercel
```bash
npx vercel
```
Add all env variables in Vercel dashboard > Settings > Environment Variables.
Set your custom domain (pitchingcoachai.com) in Vercel > Settings > Domains.

## Pages
- `/` — Homepage with CTA
- `/analyze` — Video upload + analysis + email gate + results
- `/admin` — Password-protected lead dashboard

## Architecture
- All pose detection runs IN THE BROWSER via MediaPipe — no video sent to any server
- Supabase stores leads and analysis results
- Resend sends welcome emails
- Vercel hosts the Next.js app
