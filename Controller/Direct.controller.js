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
    const query = `SELECT * FROM public.${tableName} WHERE status = 'on';`;
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
    const { customer_id, order_id, products, total, customer_type, customer_name, address, mobile_number, email, district, state } = req.body;

    // Validate required fields
    if (!order_id) return res.status(400).json({ message: 'Order ID is required' });
    if (!products || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ message: 'Products array is required and must not be empty' });
    }
    if (!total || total <= 0) return res.status(400).json({ message: 'Total must be a positive number' });

    let finalCustomerType = customer_type || 'User';
    let customerDetails = { customer_name, address, mobile_number, email, district, state };

    // If customer_id is provided (e.g., from Direct.jsx), fetch customer details
    if (customer_id) {
      const customerCheck = await pool.query(
        'SELECT id, customer_name, address, mobile_number, email, district, state, customer_type FROM public.customers WHERE id = $1',
        [customer_id]
      );
      if (customerCheck.rows.length === 0) {
        return res.status(404).json({ message: 'Customer not found' });
      }
      const { customer_name: db_name, address: db_address, mobile_number: db_mobile, email: db_email, district: db_district, state: db_state, customer_type: dbCustomerType } = customerCheck.rows[0];
      finalCustomerType = customer_type || dbCustomerType || 'User';
      customerDetails = { customer_name: db_name, address: db_address, mobile_number: db_mobile, email: db_email, district: db_district, state: db_state };
    } else {
      // For Pricelist.jsx: validate customer details and customer_type
      if (finalCustomerType !== 'User') {
        return res.status(400).json({ message: 'Customer type must be "User" for bookings without customer ID' });
      }
      if (!customer_name) return res.status(400).json({ message: 'Customer name is required' });
      if (!address) return res.status(400).json({ message: 'Address is required' });
      if (!district) return res.status(400).json({ message: 'District is required' });
      if (!state) return res.status(400).json({ message: 'State is required' });
      if (!mobile_number) return res.status(400).json({ message: 'Mobile number is required' });
      if (!email) return res.status(400).json({ message: 'Email is required' });
    }

    // Validate products
    for (const product of products) {
      const { id, product_type, quantity } = product;
      if (!id || !product_type || !quantity || quantity < 1) {
        return res.status(400).json({ message: 'Each product must have a valid ID, product type, and positive quantity' });
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

    // Insert booking
    const query = `
      INSERT INTO public.bookings (customer_id, order_id, products, total, address, mobile_number, customer_name, email, district, state, customer_type, status, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
      RETURNING id, created_at, customer_type
    `;
    const values = [
      customer_id || null,
      order_id,
      JSON.stringify(products),
      parseFloat(total),
      customerDetails.address || null,
      customerDetails.mobile_number || null,
      customerDetails.customer_name || null,
      customerDetails.email || null,
      customerDetails.district || null,
      customerDetails.state || null,
      finalCustomerType,
      'booked'
    ];
    const result = await pool.query(query, values);
    res.status(201).json({ message: 'Booking created successfully', id: result.rows[0].id, created_at: result.rows[0].created_at, customer_type: result.rows[0].customer_type });
  } catch (err) {
    console.error('Error creating booking:', err);
    res.status(500).json({ message: 'Failed to create booking' });
  }
};