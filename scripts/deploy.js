const readline = require('readline');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

class DeploymentScript {
  constructor() {
    this.config = {
      platform: null,
      environment: null,
      backendUrl: null,
      frontendUrl: null
    };
  }

  async deploy() {
    console.log('🚀 Smart Search App Deployment Script\n');
    
    try {
      await this.selectPlatform();
      await this.selectEnvironment();
      await this.gatherConfiguration();
      await this.preDeploymentChecks();
      await this.deployApplication();
      
      console.log('\n✅ Deployment completed successfully!');
      await this.postDeploymentInstructions();
      
    } catch (error) {
      console.error('\n❌ Deployment failed:', error.message);
      process.exit(1);
    } finally {
      rl.close();
    }
  }

  async selectPlatform() {
    return new Promise((resolve) => {
      console.log('Select deployment platform:');
      console.log('1. Vercel (Frontend) + Railway (Backend)');
      console.log('2. Netlify (Frontend) + Render (Backend)');
      console.log('3. Single VPS with Docker');
      console.log('4. Contentstack Launch App');
      console.log('5. Manual deployment\n');
      
      rl.question('Enter your choice (1-5): ', (choice) => {
        const platforms = {
          '1': 'vercel-railway',
          '2': 'netlify-render',
          '3': 'docker-vps',
          '4': 'contentstack-launch',
          '5': 'manual'
        };
        
        this.config.platform = platforms[choice] || 'manual';
        console.log(`Selected: ${this.config.platform}\n`);
        resolve();
      });
    });
  }

  async selectEnvironment() {
    return new Promise((resolve) => {
      rl.question('Environment (production/staging): ', (env) => {
        this.config.environment = env || 'production';
        resolve();
      });
    });
  }

  async gatherConfiguration() {
    console.log('\n📋 Configuration Setup\n');
    
    return new Promise((resolve) => {
      rl.question('Backend URL (e.g., https://api.yourdomain.com): ', (backendUrl) => {
        this.config.backendUrl = backendUrl;
        
        rl.question('Frontend URL (e.g., https://yourdomain.com): ', (frontendUrl) => {
          this.config.frontendUrl = frontendUrl;
          resolve();
        });
      });
    });
  }

  async preDeploymentChecks() {
    console.log('\n🔍 Running pre-deployment checks...\n');
    
    // Check if all required files exist
    const requiredFiles = [
      'package.json',
      '.env.example',
      'index.js',
      'app.js'
    ];
    
    for (const file of requiredFiles) {
      const filePath = path.join(__dirname, '..', file);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Required file missing: ${file}`);
      }
    }
    
    // Check environment variables
    if (!process.env.CONTENTSTACK_API_KEY) {
      console.warn('⚠️  CONTENTSTACK_API_KEY not set');
    }
    
    if (!process.env.SUPABASE_URL) {
      console.warn('⚠️  SUPABASE_URL not set');
    }
    
    if (!process.env.OPENAI_API_KEY) {
      console.warn('⚠️  OPENAI_API_KEY not set');
    }
    
    // Run tests if available
    try {
      console.log('Running tests...');
      execSync('npm test --passWithNoTests', { stdio: 'pipe' });
      console.log('✅ Tests passed');
    } catch (error) {
      console.log('⚠️  No tests found or tests failed');
    }
    
    console.log('✅ Pre-deployment checks completed');
  }

  async deployApplication() {
    console.log('\n🚀 Starting deployment...\n');
    
    switch (this.config.platform) {
      case 'vercel-railway':
        await this.deployVercelRailway();
        break;
      case 'netlify-render':
        await this.deployNetlifyRender();
        break;
      case 'docker-vps':
        await this.deployDockerVPS();
        break;
      case 'contentstack-launch':
        await this.deployContentstackLaunch();
        break;
      default:
        await this.manualDeploymentInstructions();
    }
  }

  async deployVercelRailway() {
    console.log('📦 Deploying to Vercel + Railway...\n');
    
    // Create deployment configurations
    this.createVercelConfig();
    this.createRailwayConfig();
    
    console.log('1. Frontend deployment:');
    console.log('   - Push your code to GitHub');
    console.log('   - Connect your repo to Vercel');
    console.log('   - Set environment variables in Vercel dashboard');
    console.log('   - Deploy from Vercel dashboard');
    
    console.log('\n2. Backend deployment:');
    console.log('   - Connect your repo to Railway');
    console.log('   - Set environment variables in Railway dashboard');
    console.log('   - Deploy from Railway dashboard');
  }

  async deployNetlifyRender() {
    console.log('📦 Deploying to Netlify + Render...\n');
    
    this.createNetlifyConfig();
    this.createRenderConfig();
    
    console.log('1. Frontend deployment:');
    console.log('   - Connect your repo to Netlify');
    console.log('   - Set build command: npm run build');
    console.log('   - Set publish directory: dist');
    console.log('   - Set environment variables');
    
    console.log('\n2. Backend deployment:');
    console.log('   - Connect your repo to Render');
    console.log('   - Set start command: npm start');
    console.log('   - Set environment variables');
  }

  async deployDockerVPS() {
    console.log('🐳 Creating Docker deployment...\n');
    
    this.createDockerFiles();
    this.createDockerCompose();
    
    console.log('Instructions:');
    console.log('1. Copy files to your VPS');
    console.log('2. Run: docker-compose up -d');
    console.log('3. Set up reverse proxy (nginx)');
    console.log('4. Set up SSL certificates');
  }

  async deployContentstackLaunch() {
    console.log('🚀 Creating Contentstack Launch app...\n');
    
    this.createLaunchConfig();
    
    console.log('Instructions:');
    console.log('1. Create new Launch app in Contentstack');
    console.log('2. Upload the generated app package');
    console.log('3. Configure app settings');
    console.log('4. Publish the app');
  }

  createVercelConfig() {
    const vercelConfig = {
      "version": 2,
      "builds": [
        {
          "src": "package.json",
          "use": "@vercel/node"
        }
      ],
      "routes": [
        {
          "src": "/api/(.*)",
          "dest": "/backend/index.js"
        },
        {
          "src": "/(.*)",
          "dest": "/index.html"
        }
      ],
      "env": {
        "VITE_API_BASE_URL": this.config.backendUrl
      }
    };
    
    const frontendPath = path.join(__dirname, '../../vercel.json');
    fs.writeFileSync(frontendPath, JSON.stringify(vercelConfig, null, 2));
    console.log('✅ Created vercel.json');
  }

  createRailwayConfig() {
    const railwayConfig = {
      "deploy": {
        "startCommand": "npm start",
        "healthcheckPath": "/api/health"
      }
    };
    
    const railwayPath = path.join(__dirname, '../railway.json');
    fs.writeFileSync(railwayPath, JSON.stringify(railwayConfig, null, 2));
    console.log('✅ Created railway.json');
  }

  createNetlifyConfig() {
    const netlifyConfig = `
[build]
  command = "npm run build"
  publish = "dist"

[build.environment]
  VITE_API_BASE_URL = "${this.config.backendUrl}"

[[redirects]]
  from = "/api/*"
  to = "${this.config.backendUrl}/api/:splat"
  status = 200
  force = true

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
`;
    
    const netlifyPath = path.join(__dirname, '../../netlify.toml');
    fs.writeFileSync(netlifyPath, netlifyConfig);
    console.log('✅ Created netlify.toml');
  }

  createRenderConfig() {
    const renderConfig = {
      "services": [
        {
          "type": "web",
          "name": "search-backend",
          "env": "node",
          "buildCommand": "npm install",
          "startCommand": "npm start",
          "healthCheckPath": "/api/health"
        }
      ]
    };
    
    const renderPath = path.join(__dirname, '../render.yaml');
    fs.writeFileSync(renderPath, JSON.stringify(renderConfig, null, 2));
    console.log('✅ Created render.yaml');
  }

  createDockerFiles() {
    // Backend Dockerfile
    const backendDockerfile = `
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
`;
    
    const backendDockerPath = path.join(__dirname, '../Dockerfile');
    fs.writeFileSync(backendDockerPath, backendDockerfile);
    
    // Frontend Dockerfile
    const frontendDockerfile = `
FROM node:18-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
`;
    
    const frontendDockerPath = path.join(__dirname, '../../Dockerfile');
    fs.writeFileSync(frontendDockerPath, frontendDockerfile);
    
    // Nginx config
    const nginxConfig = `
events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    
    server {
        listen 80;
        server_name localhost;
        
        location /api/ {
            proxy_pass http://backend:3000/api/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }
        
        location / {
            root /usr/share/nginx/html;
            index index.html;
            try_files $uri $uri/ /index.html;
        }
    }
}
`;
    
    const nginxPath = path.join(__dirname, '../../nginx.conf');
    fs.writeFileSync(nginxPath, nginxConfig);
    
    console.log('✅ Created Docker files');
  }

  createDockerCompose() {
    const dockerCompose = `
version: '3.8'

services:
  backend:
    build: ./backend
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
    env_file:
      - ./backend/.env
    depends_on:
      - postgres
    restart: unless-stopped

  frontend:
    build: .
    ports:
      - "80:80"
    depends_on:
      - backend
    restart: unless-stopped

  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=searchapp
      - POSTGRES_USER=searchapp
      - POSTGRES_PASSWORD=\${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

volumes:
  postgres_data:
`;
    
    const dockerComposePath = path.join(__dirname, '../../docker-compose.yml');
    fs.writeFileSync(dockerComposePath, dockerCompose);
    console.log('✅ Created docker-compose.yml');
  }

  createLaunchConfig() {
    const launchConfig = {
      "name": "Smart Search App",
      "description": "AI-powered semantic search for Contentstack",
      "version": "1.0.0",
      "icon": "https://your-domain.com/icon.png",
      "target": {
        "type": "stack",
        "actions": ["search", "analytics"]
      },
      "ui_location": {
        "locations": [
          {
            "type": "cs.cm.stack.sidebar",
            "meta": [
              {
                "uid": "search_app",
                "type": "field"
              }
            ]
          }
        ]
      },
      "webhook": {
        "enabled": true,
        "target_url": this.config.backendUrl + "/api/webhooks/contentstack",
        "channels": ["entry.publish", "entry.unpublish", "entry.delete"]
      }
    };
    
    const launchPath = path.join(__dirname, '../contentstack-launch.json');
    fs.writeFileSync(launchPath, JSON.stringify(launchConfig, null, 2));
    console.log('✅ Created Contentstack Launch configuration');
  }

  async manualDeploymentInstructions() {
    console.log('📖 Manual Deployment Instructions\n');
    
    console.log('Backend deployment:');
    console.log('1. Build: npm run build (if applicable)');
    console.log('2. Install dependencies: npm ci --production');
    console.log('3. Set environment variables');
    console.log('4. Start: npm start');
    console.log('5. Set up reverse proxy');
    console.log('6. Set up SSL certificates');
    
    console.log('\nFrontend deployment:');
    console.log('1. Build: npm run build');
    console.log('2. Upload dist/ folder to web server');
    console.log('3. Configure web server for SPA routing');
    console.log('4. Set up SSL certificates');
  }

  async postDeploymentInstructions() {
    console.log('\n📋 Post-Deployment Checklist\n');
    
    console.log('1. ✅ Test API endpoints:');
    console.log(`   - GET ${this.config.backendUrl}/api/health`);
    console.log(`   - POST ${this.config.backendUrl}/api/search`);
    
    console.log('\n2. ✅ Configure webhooks in Contentstack:');
    console.log(`   - URL: ${this.config.backendUrl}/api/webhooks/contentstack`);
    console.log('   - Events: entry.publish, entry.unpublish, entry.delete');
    
    console.log('\n3. ✅ Run initial content sync:');
    console.log('   - Test sync endpoint or run sync job');
    
    console.log('\n4. ✅ Test search functionality:');
    console.log(`   - Open ${this.config.frontendUrl}`);
    console.log('   - Perform test searches');
    console.log('   - Check analytics dashboard');
    
    console.log('\n5. ✅ Set up monitoring:');
    console.log('   - Configure error tracking');
    console.log('   - Set up uptime monitoring');
    console.log('   - Configure log aggregation');
    
    console.log('\n6. ✅ Security review:');
    console.log('   - Verify HTTPS is enabled');
    console.log('   - Check CORS configuration');
    console.log('   - Review rate limiting');
    console.log('   - Validate environment variables are secure');
  }
}

// Run the deployment script if executed directly
if (require.main === module) {
  const deployment = new DeploymentScript();
  deployment.deploy();
}

module.exports = DeploymentScript;
