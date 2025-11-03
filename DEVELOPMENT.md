# Development Guide

## Best Practices & Quality Checks

This project implements industry-standard quality checks to ensure code quality and prevent errors.

### Pre-commit Hooks (Husky + lint-staged)

Before each commit, the following checks run automatically:
- **ESLint**: Lints and auto-fixes TypeScript/TSX files
- **Prettier**: Formats code to ensure consistency

To bypass hooks (not recommended):
```bash
git commit --no-verify
```

### Build Process

The build process runs multiple checks before building:
1. **Type checking**: `pnpm typecheck` - Validates all TypeScript types
2. **Linting**: `pnpm lint` - Checks code quality
3. **Build**: Only runs if checks pass

```bash
# Build with all checks
pnpm build

# Run checks individually
pnpm typecheck  # Type check all packages
pnpm lint       # Lint all packages
pnpm lint:fix   # Lint and auto-fix all packages
```

### Development Mode Type Checking

When running the web app in dev mode, `vite-plugin-checker` provides:
- **Real-time TypeScript errors** in the browser console
- **ESLint warnings** displayed in the terminal
- **Fast feedback** without waiting for builds

```bash
pnpm dev:web  # Type errors shown in browser + terminal
```

### CI/CD Pipeline

GitHub Actions automatically runs on every push and pull request:

**Workflow**: `.github/workflows/ci.yml`

**Jobs**:
1. **Lint & Type Check**: Validates code quality
2. **Build**: Ensures all packages build successfully

The pipeline will fail if:
- Type errors are present
- Linting errors exist
- Build fails

### Package-Specific Commands

#### Web App (`apps/web`)
```bash
pnpm lint        # ESLint check
pnpm lint:fix    # ESLint auto-fix
pnpm typecheck   # TypeScript type check
pnpm build       # Build with typecheck + lint + vite build
```

#### Gateway (`apps/llm-gateway`)
```bash
pnpm lint        # ESLint check
pnpm lint:fix    # ESLint auto-fix
pnpm typecheck   # TypeScript type check
pnpm build       # TypeScript compilation
```

### Troubleshooting

**Pre-commit hooks not running?**
```bash
# Reinstall husky
pnpm prepare
```

**Type errors in dev mode too slow?**
The `vite-plugin-checker` can be temporarily disabled in `apps/web/vite.config.ts` by commenting out the checker plugin, but this is not recommended.

**Need to skip checks?**
Only do this in emergencies:
```bash
# Skip pre-commit
git commit --no-verify

# Skip checks in build (not recommended)
# Manually edit package.json build scripts
```

