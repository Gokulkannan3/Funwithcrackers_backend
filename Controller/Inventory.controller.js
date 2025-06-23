const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  database: process.env.PGDATABASE,
});

exports.addProduct = async (req, res) => {
  try {
    const { serial_number, product_name, price, per, discount, product_type } = req.body;
    const image_path = req.file ? `/uploads/${req.file.filename}` : '';

    // Validate required fields
    if (!serial_number || !product_name || !price || !discount || !product_type) {
      return res.status(400).json({ message: 'All required fields must be provided' });
    }

    let query, values, column;

    if (product_type === 'sparklers') {
      if (!image_path) {
        return res.status(400).json({ message: 'Image is required for sparklers' });
      }
      column = 'sparkles';
      const sparklesArray = [serial_number, product_name, price.toString(), discount.toString(), image_path];
      query = `INSERT INTO public.products (sparkles) VALUES ($1) RETURNING id`;
      values = [sparklesArray];
    } else if (product_type === 'ground-chakras') {
      if (!per || !['pieces', 'box'].includes(per)) {
        return res.status(400).json({ message: 'Valid per value (pieces or box) is required' });
      }
      column = 'ground_chakras';
      const groundChakrasArray = [serial_number, product_name, price.toString(), per, discount.toString(), image_path];
      query = `INSERT INTO public.Products (ground_chakra) VALUES ($1) RETURNING id`;
      values = [groundChakrasArray];
    } else {
      return res.status(400).json({ message: 'Invalid product type' });
    }

    const result = await pool.query(query, values);
    res.status(201).json({ message: 'Product saved successfully', id: result.rows[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to save product' });
  }
};

exports.getProducts = async (req, res) => {
  try {
    const query = `SELECT id, sparkles, ground_chakra FROM public.Products`;
    const result = await pool.query(query);

    const products = result.rows.map((row) => {
      if (row.sparkles) {
        return {
          id: row.id,
          product_type: 'sparklers',
          serial_number: row.sparkles[0],
          product_name: row.sparkles[1],
          price: row.sparkles[2],
          discount: row.sparkles[3],
          image_path: row.sparkles[4],
        };
      } else if (row.ground_chakra) {
        return {
          id: row.id,
          product_type: 'ground-chakras',
          serial_number: row.ground_chakra[0],
          product_name: row.ground_chakra[1],
          price: row.ground_chakra[2],
          per: row.ground_chakra[3],
          discount: row.ground_chakra[4],
          image_path: row.ground_chakra[5],
        };
      }
      return null;
    }).filter(product => product !== null);

    res.status(200).json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch products' });
  }
};