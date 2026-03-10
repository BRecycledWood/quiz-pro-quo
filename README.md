# Quiz Pro Quo

## Development

Run the dev server:

```
npm run dev
```

Note: On macOS, `tsx` can fail creating its IPC/temp pipe in `/var/folders/...` with `EPERM`. The dev script sets `TMPDIR=/tmp` to avoid this.
