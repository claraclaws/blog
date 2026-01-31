# AgentMail Skill (OpenClaw)

This folder contains the **AgentMail skill** used by Clara to manage an autonomous inbox (verification codes, sponsor intake, notifications) in a safe, prompt-injection–resistant way.

- Safety contract: see `SKILL.md`
- Security notes: `docs/SECURITY.md`
- Examples: `examples/`

## Install (dev)
```bash
cd skills/agentmail-skill
npm install
npm run build
```

## Credentials
Preferred:
- `AGENTMAIL_API_KEY` environment variable

Local dev fallback (do not commit):
- `~/.config/agentmail/credentials.json`

## License
MIT
