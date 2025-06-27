const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  database: process.env.PGDATABASE,
});

exports.getCustomers = async (req, res) => {
  try {
    const query = `
      SELECT id, customer_name AS name, address, mobile_number, email, customer_type, district, state
      FROM public.customers
    `;
    const result = await pool.query(query);
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Error fetching customers:', err);
    res.status(500).json({ message: 'Failed to fetch customers' });
  }
};

exports.getProductTypes = async (req, res) => {
  try {
    const result = await pool.query('SELECT product_type FROM public.products');
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Error fetching product types:', err);
    res.status(500).json({ message: 'Failed to fetch product types' });
  }
};

exports.getProductsByType = async (req, res) => {
  try {
    const { type } = req.query;
    if (!type) {
      return res.status(400).json({ message: 'Product type is required' });
    }

    const tableName = type.toLowerCase().replace(/\s+/g, '_');
    const query = `
      SELECT * FROM public.${tableName} WHERE status = 'on';
    `;
    const result = await pool.query(query);
    const products = result.rows.map(row => ({
      id: row.id,
      product_type: type,
      serial_number: row.serial_number,
      productname: row.productname,
      price: row.price,
      per: row.per,
      discount: row.discount,
      image: row.image,
      status: row.status
    }));
    res.status(200).json(products);
  } catch (err) {
    console.error('Error fetching products:', err);
    res.status(500).json({ message: 'Failed to fetch products' });
  }
};

exports.createBooking = async (req, res) => {
  try {
    const { customer_id, order_id, products, total } = req.body;

    if (!customer_id || !order_id || !products || !Array.isArray(products) || products.length === 0 || !total) {
      return res.status(400).json({ message: 'Customer ID, order ID, products array, and total are required' });
    }

    const customerCheck = await pool.query(
      'SELECT id, customer_name, address, mobile_number, email, district, state FROM public.customers WHERE id = $1',
      [customer_id]
    );
    if (customerCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    const { customer_name, address, mobile_number, email, district, state } = customerCheck.rows[0];

    for (const product of products) {
      const { id, product_type, quantity } = product;
      if (!id || !product_type || !quantity || quantity < 1) {
        return res.status(400).json({ message: 'Invalid product data' });
      }
      const tableName = product_type.toLowerCase().replace(/\s+/g, '_');
      const productCheck = await pool.query(
        `SELECT id FROM public.${tableName} WHERE id = $1 AND status = 'on'`,
        [id]
      );
      if (productCheck.rows.length === 0) {
        return res.status(404).json({ message: `Product ${id} of type ${product_type} not found or not available` });
      }
    }

    const query = `
      INSERT INTO public.bookings (customer_id, order_id, products, total, address, mobile_number, customer_name, email, district, state, status, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      RETURNING id, created_at
    `;
    const values = [customer_id, order_id, JSON.stringify(products), parseFloat(total), address || null, mobile_number || null, customer_name || null, email || null, district || null, state || null, 'booked'];
    const result = await pool.query(query, values);

    res.status(201).json({ message: 'Booking created successfully', id: result.rows[0].id, created_at: result.rows[0].created_at });
  } catch (err) {
    console.error('Error creating booking:', err);
    res.status(500).json({ message: 'Failed to create booking' });
  }
};