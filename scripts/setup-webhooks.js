const readline = require('readline');
const https = require('https');
const config = require('../utils/config');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

class WebhookSetup {
  constructor() {
    this.managementToken = null;
    this.webhookUrl = null;
    this.contentTypes = [];
  }

  async setup() {
    console.log('🔧 Contentstack Webhook Setup Tool\n');
    
    try {
      // Get management token
      await this.getManagementToken();
      
      // Get webhook URL
      await this.getWebhookUrl();
      
      // Fetch content types
      await this.fetchContentTypes();
      
      // Create webhook
      await this.createWebhook();
      
      console.log('\n✅ Webhook setup completed successfully!');
      console.log('\n📋 Next steps:');
      console.log('1. Test the webhook by publishing/unpublishing content in Contentstack');
      console.log('2. Monitor webhook events in your backend logs');
      console.log('3. Check that content syncs to your Supabase database');
      
    } catch (error) {
      console.error('\n❌ Setup failed:', error.message);
    } finally {
      rl.close();
    }
  }

  async getManagementToken() {
    return new Promise((resolve) => {
      console.log('To create webhooks, we need your Contentstack Management Token.');
      console.log('Get it from: Settings → Tokens → Management Tokens\n');
      
      rl.question('Enter your Management Token: ', (token) => {
        this.managementToken = token.trim();
        resolve();
      });
    });
  }

  async getWebhookUrl() {
    return new Promise((resolve) => {
      console.log('\nFor local development, you can use ngrok:');
      console.log('1. Install: npm install -g ngrok');
      console.log('2. Run: ngrok http 3000');
      console.log('3. Copy the https:// URL\n');
      
      const defaultUrl = 'https://your-domain.com/api/webhooks/contentstack';
      rl.question(`Enter webhook URL (${defaultUrl}): `, (url) => {
        this.webhookUrl = url.trim() || defaultUrl;
        resolve();
      });
    });
  }

  async fetchContentTypes() {
    console.log('\n🔍 Fetching content types from Contentstack...');
    
    const options = {
      hostname: config.contentstack.region === 'eu' ? 'eu-api.contentstack.io' : 'api.contentstack.io',
      port: 443,
      path: `/v3/content_types`,
      method: 'GET',
      headers: {
        'api_key': config.contentstack.apiKey,
        'authorization': this.managementToken,
        'Content-Type': 'application/json'
      }
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            if (response.content_types) {
              this.contentTypes = response.content_types.map(ct => ({
                uid: ct.uid,
                title: ct.title
              }));
              console.log(`Found ${this.contentTypes.length} content types:`);
              this.contentTypes.forEach(ct => {
                console.log(`  - ${ct.uid} (${ct.title})`);
              });
              resolve();
            } else {
              reject(new Error('Failed to fetch content types: ' + data));
            }
          } catch (error) {
            reject(new Error('Invalid response: ' + error.message));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error('Request failed: ' + error.message));
      });

      req.end();
    });
  }

  async createWebhook() {
    console.log('\n🚀 Creating webhook...');
    
    const webhookData = {
      webhook: {
        name: 'Smart Search Sync',
        destinations: [
          {
            target_url: this.webhookUrl,
            http_basic_auth: '',
            http_basic_password: '',
            custom_header: []
          }
        ],
        channels: ['entry.publish', 'entry.unpublish', 'entry.delete'],
        branches: [config.contentstack.environment],
        retry_policy: 'manual',
        disabled: false,
        concise_payload: false
      }
    };

    const options = {
      hostname: config.contentstack.region === 'eu' ? 'eu-api.contentstack.io' : 'api.contentstack.io',
      port: 443,
      path: '/v3/webhooks',
      method: 'POST',
      headers: {
        'api_key': config.contentstack.apiKey,
        'authorization': this.managementToken,
        'Content-Type': 'application/json'
      }
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            if (response.webhook) {
              console.log(`✅ Webhook created successfully!`);
              console.log(`   Name: ${response.webhook.name}`);
              console.log(`   URL: ${this.webhookUrl}`);
              console.log(`   Events: ${webhookData.webhook.channels.join(', ')}`);
              resolve();
            } else {
              reject(new Error('Failed to create webhook: ' + data));
            }
          } catch (error) {
            reject(new Error('Invalid response: ' + error.message));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error('Request failed: ' + error.message));
      });

      req.write(JSON.stringify(webhookData));
      req.end();
    });
  }
}

// Run the setup if this file is executed directly
if (require.main === module) {
  const setup = new WebhookSetup();
  setup.setup();
}

module.exports = WebhookSetup;
