const axios = require('axios');
const fs = require('fs');

async function testEdit() {
  try {
    const res = await axios.post('http://localhost:5000/ai/edit-code', {
      filePath: 'src/Component/Main.jsx',
      fileContent: `function Main() {
        const handleDelete = (id) => {
          const newItems = items.filter(item => item.id !== id);
          setItems(newItems);
        };
        return <div />;
      }`,
      instruction: 'add a console.log at handledelete fuction',
      projectContext: 'testProject',
      startLine: null,
      connectedFiles: []
    });
    fs.writeFileSync('response.json', JSON.stringify(res.data, null, 2));
    console.log('Done, wrote to response.json');
  } catch (err) {
    console.error('Error:', err.response ? err.response.data : err.message);
  }
}

testEdit();
