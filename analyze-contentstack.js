const contentstackService = require('./services/contentstack');
const logger = require('./utils/logger');

async function analyzeContentStackApplication() {
  try {
    console.log('\n🔍 ContentStack Application Structure Analysis');
    console.log('='.repeat(60));

    // Get content types
    console.log('\n📂 Content Types:');
    const contentTypes = await contentstackService.getContentTypes();
    
    contentTypes.forEach((type, index) => {
      console.log(`${index + 1}. ${type.uid}`);
      console.log(`   Title: ${type.title || 'N/A'}`);
      console.log(`   Description: ${type.description || 'N/A'}`);
      console.log(`   Schema Fields: ${type.schema ? Object.keys(type.schema).length : 'N/A'}`);
      console.log('');
    });

    // Get content statistics
    console.log('\n📊 Content Statistics:');
    const stats = await contentstackService.getContentStats();
    console.log(`Total Content Types: ${stats.contentTypes}`);
    console.log(`Total Entries: ${stats.totalEntries}`);
    console.log(`Locale: ${stats.locale}`);
    
    console.log('\n📈 Entries by Content Type:');
    Object.entries(stats.entriesByType).forEach(([type, count]) => {
      console.log(`  • ${type}: ${count} entries`);
    });

    // Sample a few entries from the most populated content type
    const mostPopulatedType = Object.entries(stats.entriesByType)
      .sort(([,a], [,b]) => b - a)[0];
    
    if (mostPopulatedType && mostPopulatedType[1] > 0) {
      console.log(`\n🔍 Sample Entry from "${mostPopulatedType[0]}":"`);
      try {
        const sampleEntries = await contentstackService.getEntriesByContentType(
          mostPopulatedType[0], 
          'en-us', 
          1
        );
        
        if (sampleEntries.entries && sampleEntries.entries.length > 0) {
          const entry = sampleEntries.entries[0];
          console.log('Entry Structure:');
          console.log(`  UID: ${entry.uid}`);
          console.log(`  Title: ${entry.title || 'N/A'}`);
          console.log(`  Created: ${entry.created_at || 'N/A'}`);
          console.log(`  Updated: ${entry.updated_at || 'N/A'}`);
          console.log(`  Fields: ${Object.keys(entry).filter(key => !key.startsWith('_')).length}`);
          
          // Show available fields
          const fields = Object.keys(entry).filter(key => !key.startsWith('_') && key !== 'uid');
          console.log(`  Available Fields: ${fields.join(', ')}`);
        }
      } catch (error) {
        console.log(`  Error sampling entry: ${error.message}`);
      }
    }

    // Check for recommended content structure
    console.log('\n🎯 Content Structure Recommendations:');
    
    const hasBasicBlogStructure = contentTypes.some(ct => ct.uid === 'blog_post');
    const hasPageStructure = contentTypes.some(ct => ct.uid === 'page');
    const hasFAQStructure = contentTypes.some(ct => ct.uid === 'faq');
    const hasProductStructure = contentTypes.some(ct => ct.uid === 'product');
    
    console.log(`✅ Blog Post Content Type: ${hasBasicBlogStructure ? 'Present' : 'Missing'}`);
    console.log(`✅ Page Content Type: ${hasPageStructure ? 'Present' : 'Missing'}`);
    console.log(`⚠️  FAQ Content Type: ${hasFAQStructure ? 'Present' : 'Missing (Recommended)'}`);
    console.log(`⚠️  Product Content Type: ${hasProductStructure ? 'Present' : 'Missing (Optional)'}`);

  } catch (error) {
    console.error('❌ Analysis failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Run the analysis
analyzeContentStackApplication().then(() => {
  console.log('\n✅ Analysis completed');
  process.exit(0);
}).catch(error => {
  console.error('❌ Analysis failed:', error);
  process.exit(1);
});
