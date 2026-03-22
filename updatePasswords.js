const bcrypt = require('bcrypt');
const hash = bcrypt.hashSync('admin$2b$10$qtvX5nm4ixIW96Nx.qDFYuukdThXPxKhLlzC05L0g/ZNXtxgngf7i', 10);
console.log(hash);
