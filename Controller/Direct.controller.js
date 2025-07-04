const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const PDFDocument = require('pdfkit');
const multer = require('multer');

// Database connection
const pool = new Pool({
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  database: process.env.PGDATABASE,
});

// Multer configuration
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
    const safeCustomerName = customer_name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    cb(null, `${safeCustomerName}-${order_id}.pdf`);
  }
});
const upload = multer({ storage });

// WhatsApp configuration
const ACCESS_TOKEN = 'EAAkAptynZC8UBPBqaui7g6OVQH6TfDuDbxhtIU0qiLM7OG4wvs37VIo48X1e97AZBCvpDPrEy1XBhbWcU8wFF6eC6PwutUk4pP2qoJlritdxkRQtGIGZAKtewtHJXvDwTrAih8p3p7NPuDQuajqI1U7XDtUZBgAK8XvK4nUOiaSPZCOlb5o8SZCUi4zrF92RdDBcaWIdxGzl1tnyTdpCsZAoZB5dkXAeGSC0BRXYsL7K4RkZD';
const PHONE_NUMBER_ID = '222295047641979';

// Generate PDF invoice
const generateInvoicePDF = (bookingData, customerDetails, products) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const safeCustomerName = customerDetails.customer_name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    const pdfPath = path.join(__dirname, '../pdf_data', `${safeCustomerName}-${bookingData.order_id}.pdf`);
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

    // Total
    doc.moveDown(2);
    doc.font('Helvetica-Bold').text(`Total: Rs.${total.toFixed(2)}`, 450, y + 20);

    doc.end();
    
    stream.on('finish', () => {
      console.log('PDF generated at:', pdfPath);
      resolve(pdfPath);
    });
    stream.on('error', (err) => {
      console.error('Error generating PDF:', err);
      reject(err);
    });
  });
};

// Upload PDF to WhatsApp and return media ID
async function uploadPDF(pdfPath) {
  const form = new FormData();
  form.append('file', fs.createReadStream(pdfPath));
  form.append('type', 'application/pdf');
  form.append('messaging_product', 'whatsapp');

  const res = await axios.post(
    `https://graph.facebook.com/v17.0/${PHONE_NUMBER_ID}/media`,
    form,
    {
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        ...form.getHeaders(),
      },
    }
  );

  return res.data.id;
}

// Send template with document via WhatsApp
async function sendTemplateWithPDF(mediaId, total, customerDetails) {
  // Format mobile number: remove non-digits and ensure it starts with country code
  let recipientNumber = customerDetails.mobile_number;
  if (!recipientNumber) {
    throw new Error('Mobile number is missing in customer details');
  }
  // Remove any non-digit characters (spaces, dashes, etc.)
  recipientNumber = recipientNumber.replace(/\D/g, '');
  // Ensure it starts with country code (e.g., +91 for India)
  if (!recipientNumber.startsWith('+')) {
    // Assuming Indian number if no country code is provided
    if (recipientNumber.length === 10) {
      recipientNumber = `+91${recipientNumber}`;
    } else if (recipientNumber.length === 12 && recipientNumber.startsWith('91')) {
      recipientNumber = `+${recipientNumber}`;
    } else {
      throw new Error('Invalid mobile number format');
    }
  }

  const payload = {
    messaging_product: 'whatsapp',
    to: recipientNumber,
    type: 'template',
    template: {
      name: 'purchase_receipt_1',
      language: { code: 'en_US' },
      components: [
        {
          type: 'header',
          parameters: [
            {
              type: 'document',
              document: {
                id: mediaId,
                filename: 'receipt.pdf',
              },
            },
          ],
        },
        {
          type: 'body',
          parameters: [
            { type: 'text', text: `Rs.${parseFloat(total).toFixed(2)}` }, // {{1}}
            { type: 'text', text: `Phoenix Crackers, Anil kumar Eye Hospital Opp, Sattur Road, Sivakasi` }, // {{2}}
            { type: 'text', text: 'receipt' }, // {{3}}
          ],
        },
      ],
    },
  };

  const res = await axios.post(
    `https://graph.facebook.com/v17.0/${PHONE_NUMBER_ID}/messages`,
    payload,
    {
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
  );

  console.log('✅ Template with PDF sent to:', recipientNumber);
  console.log(JSON.stringify(res.data, null, 2));
}

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
      price: parseFloat(row.price),
      per: row.per,
      discount: parseFloat(row.discount),
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
    console.log('Creating booking with order_id:', order_id);

    if (!order_id) return res.status(400).json({ message: 'Order ID is required' });
    if (!/^[a-zA-Z0-9-_]+$/.test(order_id)) {
      console.log('Invalid order_id format:', order_id);
      return res.status(400).json({ message: 'Invalid order_id format' });
    }
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
        console.log('Customer not found for customer_id:', customer_id);
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
        console.log('Invalid product data:', { id, product_type, quantity });
        return res.status(400).json({ message: 'Each product must have a valid ID, product type, and positive quantity' });
      }
      const tableName = product_type.toLowerCase().replace(/\s+/g, '_');
      const productCheck = await pool.query(
        `SELECT id FROM public.${tableName} WHERE id = $1 AND status = 'on'`,
        [id]
      );
      if (productCheck.rows.length === 0) {
        console.log(`Product not found: id=${id}, type=${product_type}`);
        return res.status(404).json({ message: `Product ${id} of type ${product_type} not found or not available` });
      }
    }

    // Generate PDF
    const pdfPath = await generateInvoicePDF(
      { order_id, customer_type: finalCustomerType, total },
      customerDetails,
      products
    );
    console.log('Booking PDF path:', pdfPath);

    // Insert booking with PDF path
    const query = `
      INSERT INTO public.bookings (customer_id, order_id, products, total, address, mobile_number, customer_name, email, district, state, customer_type, status, created_at, pdf)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), $13)
      RETURNING id, created_at, customer_type, pdf, order_id
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
      'booked',
      pdfPath
    ];
    const result = await pool.query(query, values);
    console.log('Booking inserted:', { id: result.rows[0].id, order_id: result.rows[0].order_id, pdf: result.rows[0].pdf });

    // Send PDF via WhatsApp
    console.log('📤 Uploading PDF to WhatsApp...');
    const mediaId = await uploadPDF(pdfPath);
    console.log('📎 Uploaded Media ID:', mediaId);

    console.log('📩 Sending template via WhatsApp...');
    await sendTemplateWithPDF(mediaId, total, customerDetails);

    res.status(201).json({
      message: 'Booking created successfully and PDF sent via WhatsApp',
      id: result.rows[0].id,
      created_at: result.rows[0].created_at,
      customer_type: result.rows[0].customer_type,
      pdf_path: result.rows[0].pdf,
      order_id: result.rows[0].order_id
    });
  } catch (err) {
    console.error('Error creating booking or sending PDF:', err);
    res.status(500).json({ message: 'Failed to create booking or send PDF', error: err.response ? JSON.stringify(err.response.data, null, 2) : err.message });
  }
};

exports.getInvoice = async (req, res) => {
  try {
    let { order_id } = req.params;
    console.log('Received order_id: ', order_id);

    // Strip .pdf extension if present
    if (order_id.endsWith('.pdf')) {
      order_id = order_id.replace(/\.pdf$/, '');
      console.log('Stripped order_id:', order_id);
    }

    // Validate order_id format
    if (!/^[a-zA-Z0-9-_]+$/.test(order_id)) {
      console.log('Invalid order_id format:', order_id);
      return res.status(400).json({ message: 'Invalid order_id format' });
    }

    // Try direct lookup by order_id
    let bookingQuery = await pool.query(
      'SELECT products, total, customer_name, address, mobile_number, email, district, state, customer_type, pdf FROM public.bookings WHERE order_id = $1',
      [order_id]
    );

    // Fallback: try to extract customer_name and order_id if direct lookup fails
    if (bookingQuery.rows.length === 0) {
      console.log('Direct lookup failed for order_id:', order_id);
      // Assume format is customer_name-order_id
      const parts = order_id.split('-');
      if (parts.length > 1) {
        const possibleOrderId = parts.slice(1).join('-');
        console.log('Trying fallback with order_id:', possibleOrderId);
        bookingQuery = await pool.query(
          'SELECT products, total, customer_name, address, mobile_number, email, district, state, customer_type, pdf FROM public.bookings WHERE order_id = $1',
          [possibleOrderId]
        );
      }
    }

    if (bookingQuery.rows.length === 0) {
      console.log('Booking not found for order_id:', order_id);
      return res.status(404).json({ 
        message: 'Invoice not found', 
        details: `No booking found for order_id '${order_id}'. Please use the order_id from the booking response (e.g., 'ORD-1751548161837').`
      });
    }

    const { products, total, customer_name, address, mobile_number, email, district, state, customer_type, pdf } = bookingQuery.rows[0];
    console.log('PDF Path from DB:', pdf);

    // Check if PDF file exists
    if (!fs.existsSync(pdf)) {
      console.log('PDF not found, regenerating...');
      const regeneratedPdfPath = await generateInvoicePDF(
        { order_id: bookingQuery.rows[0].order_id, customer_type, total },
        { customer_name, address, mobile_number, email, district, state },
        JSON.parse(products)
      );
      // Update the pdf column with the regenerated path
      await pool.query('UPDATE public.bookings SET pdf = $1 WHERE order_id = $2', [regeneratedPdfPath, bookingQuery.rows[0].order_id]);
      console.log('Regenerated PDF Path:', regeneratedPdfPath);
    }

    // Set headers and stream the PDF
    const safeCustomerName = customer_name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${safeCustomerName}-${bookingQuery.rows[0].order_id}.pdf`);
    fs.createReadStream(pdf).pipe(res);
  } catch (err) {
    console.error('Error fetching invoice:', err);
    res.status(500).json({ message: 'Failed to fetch invoice', error: err.message });
  }
};

// Log exports to verify
console.log('Controller exports:', module.exports);