# Git Setup Instructions - SSH/Token Authentication

## Quick Start (SSH or Token Authentication)

### Option 1: SSH Key Authentication (Recommended)

**Step 1: Install Git**
```bash
sudo apt install git
```

**Step 2: Generate SSH Key (if you don't have one)**
```bash
ssh-keygen -t ed25519 -C "your.email@example.com"
# Press Enter to accept default location (~/.ssh/id_ed25519)
# Press Enter twice for no passphrase (or set one if preferred)
```

**Step 3: Add SSH Key to GitHub**
```bash
# Display your public key
cat ~/.ssh/id_ed25519.pub

# Copy the output, then:
# 1. Go to GitHub.com → Settings → SSH and GPG keys
# 2. Click "New SSH key"
# 3. Paste the key and save
```

**Step 4: Test SSH Connection**
```bash
ssh -T git@github.com
# Should say: "Hi username! You've successfully authenticated..."
```

**Step 5: Run Setup Script**
```bash
./push-to-github.sh
# When prompted for remote URL, use: git@github.com:USERNAME/REPO.git
```

---

### Option 2: Personal Access Token (PAT)

**Step 1: Install Git**
```bash
sudo apt install git
```

**Step 2: Configure Git**
```bash
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

**Step 3: Create GitHub Personal Access Token**
1. Go to: https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Name it: "Local Development"
4. Select scopes: `repo` (full control of private repositories)
5. Click "Generate token"
6. **Copy the token immediately** (you won't see it again!)

**Step 4: Run Setup Script**
```bash
./push-to-github.sh
# When prompted for remote URL, use: https://github.com/USERNAME/REPO.git
# When asked for password, paste your Personal Access Token
```

---

### Option 3: GitHub CLI (gh)

**Step 1: Install GitHub CLI**
```bash
sudo apt install gh
```

**Step 2: Authenticate**
```bash
gh auth login
# Follow prompts:
# - Choose GitHub.com
# - Choose HTTPS or SSH
# - Authenticate via browser or token
```

**Step 3: Create Repository (if needed)**
```bash
gh repo create YOUR_REPO_NAME --public --source=. --remote=origin --push
```

---

## Manual Setup Commands

**Initialize and Commit:**
```bash
cd /home/dp/Desktop/2.0
git init
git branch -M main
git add .
git commit -m "feat: Complete Phase 1-4 optimizations

Phase 1: Quick Wins - CodeBlock memoization
Phase 2: Component Refactoring - MainChatLayout & ArtifactPane split
Phase 3: State Management - Decoupled stores
Phase 4: Testing & Quality - Request cancellation"
```

**Add Remote (SSH):**
```bash
git remote add origin git@github.com:USERNAME/REPO.git
```

**Add Remote (HTTPS - use token as password):**
```bash
git remote add origin https://github.com/USERNAME/REPO.git
```

**Push:**
```bash
git push -u origin main
```

---

## Troubleshooting

**SSH Issues:**
```bash
# Test SSH connection
ssh -T git@github.com

# If connection fails, check SSH agent
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519
```

**Token Issues:**
- Make sure token has `repo` scope
- Use token as password (not your GitHub password)
- Token expires after 90 days (classic) or set expiration

**Permission Issues:**
- Make sure you have write access to the repository
- Check repository is not archived
- Verify you're using the correct username/repo name
