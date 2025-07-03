const { Pool } = require('pg');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const pool = new Pool({
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  database: process.env.PGDATABASE,
});

// Multer configuration for PDF storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const pdfDir = path.join(__dirname, '../pdf_data');
    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true });
    }
    cb(null, pdfDir);
  },
  filename: (req, file, cb) => {
    const { customer_name, order_id } = req.body;
    const safeCustomerName = customer_name.toLowerCase().replace(/\s+/g, '_');
    cb(null, `${safeCustomerName}-${order_id}.pdf`);
  }
});

const upload = multer({ storage });

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
    const productTypesResult = await pool.query('SELECT product_type FROM public.products');
    const productTypes = productTypesResult.rows.map(row => row.product_type);
    let allProducts = [];
    for (const productType of productTypes) {
      const tableName = productType.toLowerCase().replace(/\s+/g, '_');
      const query = `
        SELECT id, serial_number, productname, price, per, discount, image, status, $1 AS product_type
        FROM public.${tableName}
        WHERE status = 'on'
      `;
      const result = await pool.query(query, [productType]);
      allProducts = allProducts.concat(result.rows);
    }
    const products = allProducts.map(row => ({
      id: row.id,
      product_type: row.product_type,
      serial_number: row.serial_number,
      productname: row.productname,
      price: parseFloat(row.price), // Ensure price is a number
      per: row.per,
      discount: parseFloat(row.discount), // Ensure discount is a number
      image: row.image,
      status: row.status
    }));
    res.status(200).json(products);
  } catch (err) {
    console.error('Error fetching products:', err);
    res.status(500).json({ message: 'Failed to fetch products' });
  }
};

// Generate PDF invoice
const generateInvoicePDF = (bookingData, customerDetails, products) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const pdfPath = path.join(__dirname, '../pdf_data', `${customerDetails.customer_name.toLowerCase().replace(/\s+/g, '_')}-${bookingData.order_id}.pdf`);
    
    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);

    // Header
    doc.fontSize(20).font('Helvetica-Bold').text('Phoenix Crackers', 50, 50);
    doc.fontSize(12).font('Helvetica').text('Location: Phoenix Crackers, Anil kumar Eye Hospital Opp, Sattur Road, Sivakasi', 50, 80);
    doc.text('Mobile Number: +91 63836 59214', 50, 95);
    doc.text('Email Address: nivasramasamy27@gmail.com', 50, 110);
    
    // Invoice Title
    doc.fontSize(16).font('Helvetica-Bold').text('Invoice', 50, 150);
    
    // Customer Details
    doc.fontSize(12).font('Helvetica')
      .text(`Customer Name: ${customerDetails.customer_name || 'N/A'}`, 50, 180)
      .text(`Contact: ${customerDetails.mobile_number || 'N/A'}`, 50, 195)
      .text(`Address: ${customerDetails.address || 'N/A'}`, 50, 210)
      .text(`District: ${customerDetails.district || 'N/A'}`, 50, 225)
      .text(`State: ${customerDetails.state || 'N/A'}`, 50, 240)
      .text(`Customer Type: ${bookingData.customer_type || 'User'}`, 50, 255)
      .text(`Order ID: ${bookingData.order_id}`, 50, 270);

    // Table Header
    const tableY = 320;
    doc.fontSize(10).font('Helvetica-Bold')
      .text('Product', 50, tableY)
      .text('Quantity', 250, tableY)
      .text('Price', 350, tableY)
      .text('Total', 450, tableY);
    
    
    // Table Content
    let y = tableY + 25;
    let total = 0;
    products.forEach((product, index) => {
      const price = parseFloat(product.price);
      const discount = parseFloat(product.discount);
      const productTotal = (price - (price * discount / 100)) * product.quantity;
      total += productTotal;
      doc.font('Helvetica')
        .text(product.productname, 50, y)
        .text(product.quantity, 250, y)
        .text(`Rs.${price.toFixed(2)}`, 350, y)
        .text(`Rs.${productTotal.toFixed(2)}`, 450, y);
      y += 20;
      if (index < products.length - 1) {
        doc.moveTo(50, y - 5).lineTo(550, y - 5).stroke();
      }
    });

    doc.moveDown(2);
    doc.font('Helvetica-Bold').text(`Total: Rs.${total.toFixed(2)}`, 450, y + 20);

    doc.end();
    
    stream.on('finish', () => resolve(pdfPath));
    stream.on('error', reject);
  });
};

exports.createBooking = async (req, res) => {
  try {
    const { customer_id, order_id, products, total, customer_type, customer_name, address, mobile_number, email, district, state } = req.body;
    if (!order_id) return res.status(400).json({ message: 'Order ID is required' });
    if (!products || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ message: 'Products array is required and must not be empty' });
    }
    if (!total || total <= 0) return res.status(400).json({ message: 'Total must be a positive number' });
    let finalCustomerType = customer_type || 'User';
    let customerDetails = { customer_name, address, mobile_number, email, district, state };
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

    // Generate PDF
    const pdfPath = await generateInvoicePDF(
      { order_id, customer_type: finalCustomerType, total },
      customerDetails,
      products
    );

    res.status(201).json({ 
      message: 'Booking created successfully', 
      id: result.rows[0].id, 
      created_at: result.rows[0].created_at, 
      customer_type: result.rows[0].customer_type,
      pdf_path: `/pdf_data/${customerDetails.customer_name.toLowerCase().replace(/\s+/g, '_')}-${order_id}.pdf`
    });
  } catch (err) {
    console.error('Error creating booking:', err);
    res.status(500).json({ message: 'Failed to create booking' });
  }
};

exports.getInvoice = async (req, res) => {
  try {
    const { filename } = req.params;
    const pdfPath = path.join(__dirname, '../pdf_data', filename);
    
    if (!fs.existsSync(pdfPath)) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    fs.createReadStream(pdfPath).pipe(res);
  } catch (err) {
    console.error('Error fetching invoice:', err);
    res.status(500).json({ message: 'Failed to fetch invoice' });
  }
};