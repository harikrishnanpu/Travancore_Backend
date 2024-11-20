import http from 'http';
import { Server } from 'socket.io';
import express from 'express';
import mongoose from 'mongoose';
import dotenv, { parse } from 'dotenv';
import path from 'path';
import productRouter from './routers/productRouter.js';
import userRouter from './routers/userRouter.js';
import orderRouter from './routers/orderRouter.js';
import uploadRouter from './routers/uploadRouter.js';
import billingRouter from './routers/billingRouter.js';
import cors from 'cors';
import Location from './models/locationModel.js';
import returnRouter from './routers/returnRouter.js';
import xlsx from 'xlsx'; // Use 'xlsx' import for ES modules
import logMiddleware from './middleware.js';
import bodyParser from 'body-parser';
import { chromium } from 'playwright'; 
import transactionRouter from './routers/dailyRouter.js';
import purchaseRouter from './routers/purchaseRouter.js';

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(logMiddleware);
app.use(bodyParser.json({ limit: '10mb' }));



mongoose.connect(process.env.MONGODB_URL || 'mongodb+srv://hari:123456780@kktradingbackend.ip6yq.mongodb.net/?retryWrites=true&w=majority&appName=KKTRADINGBACKEND');
app.use('/api/uploads', uploadRouter);
app.use('/api/users', userRouter);
app.use('/api/products', productRouter);
app.use('/api/orders', orderRouter);
app.use('/api/billing', billingRouter); // Use the billing routes under the /api/billing path
app.use('/api/returns',returnRouter);
app.use('/api/daily',transactionRouter); 
app.use('/api/purchases',purchaseRouter);

app.get('/api/config/paypal', (req, res) => {
  res.send(process.env.PAYPAL_CLIENT_ID || 'sb');
});
app.get('/api/config/google', (req, res) => {
  res.send(process.env.GOOGLE_API_KEY || '');
});
const __dirname = path.resolve();
app.use('/uploads', express.static(path.join(__dirname, '/uploads')));
app.use(express.static(path.join(__dirname, '/frontend/build')));
// app.get('*', (req, res) =>
//   res.sendFile(path.join(__dirname, '/frontend/build/index.html'))
// );


app.get('/', (req, res) => {
  res.send('Server is ready');
});

app.use((err, req, res, next) => {
  res.status(500).send({ message: err.message });
});

// Helper function to safely get values or return "N/A" if undefined
const safeGet = (value) => (value ? value : 'N/A');

app.post('/generate-pdf', async (req, res) => {
  const {
    invoiceNo,
    invoiceDate,
    salesmanName,
    expectedDeliveryDate,
    deliveryStatus,
    paymentStatus,
    paymentAmount,
    paymentMethod,
    paymentReceivedDate,
    customerName,
    customerAddress,
    customerContactNumber,
    marketedBy,
    billingAmount,
    subTotal,
    cgst,
    sgst,
    discount,
    products,
  } = safeGet(req.body);

  // Safely handle products array
  const productList = Array.isArray(products) ? products : [];
  const totalProducts = productList.length;

  const productsPerPage = 15;

  // Function to generate invoice content
  const generatePageHTML = (
    productsChunk,
    pageNumber,
    totalPages,
    showTotals
  ) => `
  <div class="invoice">
        <!-- Header Section -->
        <div class="header">
            <p style="font-weight: 900;">KK TRADING</p>
            <p style="font-size: 12px;margin-top: 10px;font-weight: 900;">Tiles, Granites, Sanitary Wares, UV Sheets</p>
        </div>

        <!-- Invoice Information -->
        <div class="invoice-info">
            <div>
                <p style="font-size: 12px;font-weight: bolder;">Estimate no: <strong>${invoiceNo}</strong></p>
                <p>Invoice Date: <strong>${new Date(invoiceDate).toLocaleDateString()}</strong></p>
                <p>Expected Delivery Date: <strong>${new Date(expectedDeliveryDate).toLocaleDateString()}</strong></p>
                <p>Salesman: <strong>${salesmanName}</strong></p>
                <p>Additional Info:</p>
            </div>
            <div>
                <p><strong>From:</strong></p>
                <p style="font-weight: bold;">KK TRADING</p>
                <p style="font-size: 10px;">Moncompu, Chambakulam,Road</p>
                <p style="font-size: 10px;">Alappuzha, 688503</p>
                <p style="font-size: 10px;">Contact: 0477 2080282</p>
                <p style="font-size: 10px;">tradeinkk@gmail.com</p>
            </div>
        </div>
        <div class="invoice-info">

        <div style="font-size: 10px;">
            <p><strong>Estimate To:</strong></p>
            <p style="font-weight: bold;">${customerName}</p>
            <p>${customerAddress}</p>
            <p>State: Kerala</p>
            <p>Contact: ${customerContactNumber}</p>
        </div>

        <div style="font-size: 10px;">
            <p style="font-size: 15px;"><strong>Estimate Bill</strong></p>
        </div>

        <div style="font-size: 10px;">
            <p><strong>Payment:</strong></p>
            <p>Amount Paid: ${paymentAmount} </p>
            <p>Payment Method: ${paymentMethod || ''}</p>
            <p>Received Date: ${paymentReceivedDate || ''} </p>
            <p>Remaining Amount: ${(parseFloat(billingAmount) - parseFloat( paymentAmount + discount )).toFixed(2)}  </p>
        </div>

        </div>

        <!-- Invoice Table -->
        <table class="invoice-table">
            <thead>
                <tr>
                    <th>Sl</th>
                    <th>Item Id</th>
                    <th>Item Name</th>
                    <th>QTY</th>
                    <th>Unit</th>
                    <th>Price</th>
                    <th>QTY(nos)</th>
                    <th>Unit Rate + Tax</th>
                    <th>Total Amount</th>
                </tr>
            </thead>
            <tbody>
                ${
                    productsChunk.length > 0
                      ? productsChunk.map((product,index) => `
                          <tr>
          <td>${index + 1 + (pageNumber - 1) * productsPerPage}</td> <!-- Correct serial number -->
                              <td>${safeGet(product.item_id)}</td>
                              <td>${safeGet(product.name)}</td>
                              <td>${safeGet(product.enteredQty)}</td>
                              <td>${safeGet(product.unit)}</td>
                              <td>${safeGet(product.sellingPrice)}</td>
                              <td>${safeGet(product.quantity)}</td>
                              <td>${safeGet(product.sellingPriceinQty)}</td>
                              <td>${(product.quantity * product.sellingPriceinQty).toFixed(2) || 'N/A'}</td>
                          </tr>`).join('')
                      : '<tr><td colspan="5">No Products Available</td></tr>'
                  }
            </tbody>
        </table>

        <!-- Totals Section -->
        ${showTotals ? `
        <div style="display: flex; justify-content: space-between;" class="totals">
            <div style="font-size: 10px;margin-top: 50px;" class="payment-instructions">
                <p><strong>Authorised Signatory:</strong></p>
                <p style="margin-top: 40px;">Date: ------------------------------</p>
                <p style="font-weight: bold;text-align: center;margin-top: 20px;">KK TRADING</p>
            </div>
            <div>
                <p>Subtotal: <span>${parseFloat(subTotal || 0).toFixed(2)}</span></p>
                <p>Discount: <span>${parseFloat(discount || 0).toFixed(2)}</span></p>
                <p>Cgst (9%): <span>${parseFloat(cgst || 0).toFixed(2)}</span></p>
                <p>Sgst (9%): <span>${parseFloat(sgst || 0).toFixed(2)}</span></p>
                <p>Round Off: <span>0.0</span></p>
                <p style="font-size: 15px;"><strong>Total Amount: <span>${(billingAmount - discount).toFixed(2)}</span></strong></p>
            </div>
        </div> ` : `` }

        <!-- Payment Instructions -->

        <!-- Footer Section -->
                <footer>Page ${pageNumber} of ${totalPages}</footer>
        <footer>
            <p>Thank you for your business! After 30 days of delivery no products will not be replaced.</p>
        </footer>
    </div>
  `;

  // Generate the full HTML content
  let combinedHTMLContent = '';
  const totalPages = Math.ceil(productList.length / productsPerPage);

  for (let i = 0; i < totalPages; i++) {
    const productsChunk = productList.slice(
      i * productsPerPage,
      (i + 1) * productsPerPage
    );
    const showTotals = i === totalPages - 1;
    combinedHTMLContent += generatePageHTML(
      productsChunk,
      i + 1,
      totalPages,
      showTotals
    );
  }

  const fullHTMLContent = `
  <html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>KK INVOICE</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: Arial, sans-serif;
        }
        body {
            background-color: #f9f9f9;
        }
        .invoice {
            background-color: #fff;
            width: 100%;
            padding: 20px;
            border-radius: 10px;
            box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
            margin: auto;
        }
        .header {
            background-color: #960101; /* Dark Red */
            padding: 20px;
            color: #fff;
            text-align: center;
            font-size: 20px;
            font-weight: bold;
            border-top-left-radius: 10px;
            border-top-right-radius: 10px;
        }
        .invoice-info {
            display: flex;
            justify-content: space-between;
            margin-top: 20px;
            padding-bottom: 20px;
            border-bottom: 2px solid #e0e0e0;
        }
        .invoice-info div {
            font-size: 10px;
            color: #333;
        }
        .address-section {
            display: flex;
            justify-content: space-between;
            margin: 20px 0;
        }
        .address-section div {
            width: 45%;
        }
        .address-section p {
            margin: 5px 0;
        }
        .invoice-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
        }
        .invoice-table th {
            background-color: #f4cccc; /* Light Red */
            color: #960101; /* Dark Red */
            padding: 12px;
            border: 1px solid #ddd;
            font-size: 12px;
        }
        .invoice-table td {
            padding: 12px;
            text-align: center;
            border: 1px solid #ddd;
            font-size: 10px;
        }
        .totals {
            margin-top: 20px;
            text-align: right;
        }
        .totals p {
            margin: 5px 0;
            font-size: 10px;
        }
        .totals span {
            font-weight: bold;
            color: #960101;
        }
        .payment-instructions {
            margin-top: 30px;
        }
        footer {
            text-align: center;
            margin-top: 40px;
            font-size: 12px;
            color: #777;
        }
    </style>
    </head>
    <body>
    ${combinedHTMLContent}
    </body>
    </html>
`;

  // Generate the PDF using Playwright
  try {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent(fullHTMLContent, { waitUntil: 'networkidle' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '10px', bottom: '10px', left: '10px', right: '10px' },
    });

    await browser.close();

    // Send the PDF as a response
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename=Invoice_${invoiceNo}.pdf`
    );
    res.setHeader('Content-Length', pdfBuffer.length);
    res.end(pdfBuffer);
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

// New route to send the HTML content directly
app.post('/generate-invoice-html', (req, res) => {
  const {
    invoiceNo,
    invoiceDate,
    salesmanName,
    expectedDeliveryDate,
    deliveryStatus,
    paymentStatus,
    paymentAmount,
    paymentMethod,
    paymentReceivedDate,
    customerName,
    customerAddress,
    customerContactNumber,
    marketedBy,
    billingAmount,
    subTotal,
    cgst,
    sgst,
    discount,
    products,
  } = safeGet(req.body);

  // Safely handle products array
  const productList = Array.isArray(products) ? products : [];
  const totalProducts = productList.length;

  const productsPerPage = 15;

  // Function to generate invoice content
  const generatePageHTML = (
    productsChunk,
    pageNumber,
    totalPages,
    showTotals
  ) => `
   <div class="invoice">
        <!-- Header Section -->
        <div class="header">
            <p style="font-weight: 900;">KK TRADING</p>
            <p style="font-size: 12px;margin-top: 10px;font-weight: 900;">Tiles, Granites, Sanitary Wares, UV Sheets</p>
        </div>

        <!-- Invoice Information -->
        <div class="invoice-info">
            <div>
                <p style="font-size: 12px;font-weight: bolder;">Estimate no: <strong>${invoiceNo}</strong></p>
                <p>Invoice Date: <strong>${new Date(invoiceDate).toLocaleDateString()}</strong></p>
                <p>Expected Delivery Date: <strong>${new Date(expectedDeliveryDate).toLocaleDateString()}</strong></p>
                <p>Salesman: <strong>${salesmanName}</strong></p>
                <p>Additional Info:</p>
            </div>
            <div>
                <p><strong>From:</strong></p>
                <p style="font-weight: bold;">KK TRADING</p>
                <p style="font-size: 10px;">Moncompu, Chambakulam,Road</p>
                <p style="font-size: 10px;">Alappuzha, 688503</p>
                <p style="font-size: 10px;">Contact: 0477 2080282</p>
                <p style="font-size: 10px;">tradeinkk@gmail.com</p>
            </div>
        </div>
        <div class="invoice-info">

        <div style="font-size: 10px;">
            <p><strong>Estimate To:</strong></p>
            <p style="font-weight: bold;">${customerName}</p>
            <p>${customerAddress}</p>
            <p>State: Kerala</p>
            <p>Contact: ${customerContactNumber}</p>
        </div>

        <div style="font-size: 10px;">
            <p style="font-size: 15px;"><strong>Estimate Bill</strong></p>
        </div>

        <div style="font-size: 10px;">
            <p><strong>Payment:</strong></p>
            <p>Amount Paid: ${paymentAmount} </p>
            <p>Payment Method: ${paymentMethod || ''}</p>
            <p>Received Date: ${paymentReceivedDate || ''} </p>
            <p>Remaining Amount: ${(parseFloat(billingAmount) - parseFloat( paymentAmount + discount )).toFixed(2)}  </p>
        </div>

        </div>

        <!-- Invoice Table -->
        <table class="invoice-table">
            <thead>
                <tr>
                    <th>Sl</th>
                    <th>Item Id</th>
                    <th>Item Name</th>
                    <th>QTY</th>
                    <th>Unit</th>
                    <th>Price</th>
                    <th>QTY(nos)</th>
                    <th>Unit Rate + Tax</th>
                    <th>Total Amount</th>
                </tr>
            </thead>
            <tbody>
                ${
                    productsChunk.length > 0
                      ? productsChunk.map((product,index) => `
                          <tr>
          <td>${index + 1 + (pageNumber - 1) * productsPerPage}</td> <!-- Correct serial number -->
                              <td>${safeGet(product.item_id)}</td>
                              <td>${safeGet(product.name)}</td>
                              <td>${safeGet(product.enteredQty)}</td>
                              <td>${safeGet(product.unit)}</td>
                              <td>${safeGet(product.sellingPrice)}</td>
                              <td>${safeGet(product.quantity)}</td>
                              <td>${safeGet(product.sellingPriceinQty)}</td>
                              <td>${(product.quantity * product.sellingPriceinQty).toFixed(2) || 'N/A'}</td>
                          </tr>`).join('')
                      : '<tr><td colspan="5">No Products Available</td></tr>'
                  }
            </tbody>
        </table>

        <!-- Totals Section -->
        ${showTotals ? `
        <div style="display: flex; justify-content: space-between;" class="totals">
            <div style="font-size: 10px;margin-top: 50px;" class="payment-instructions">
                <p><strong>Authorised Signatory:</strong></p>
                <p style="margin-top: 40px;">Date: ------------------------------</p>
                <p style="font-weight: bold;text-align: center;margin-top: 20px;">KK TRADING</p>
            </div>
            <div>
                <p>Subtotal: <span>${parseFloat(subTotal || 0).toFixed(2)}</span></p>
                <p>Discount: <span>${parseFloat(discount || 0).toFixed(2)}</span></p>
                <p>Cgst (9%): <span>${parseFloat(cgst || 0).toFixed(2)}</span></p>
                <p>Sgst (9%): <span>${parseFloat(sgst || 0).toFixed(2)}</span></p>
                <p>Round Off: <span>0.0</span></p>
                <p style="font-size: 15px;"><strong>Total Amount: <span>${(billingAmount - discount).toFixed(2)}</span></strong></p>
            </div>
        </div> ` : `` }

        <!-- Payment Instructions -->

        <!-- Footer Section -->
                <footer>Page ${pageNumber} of ${totalPages}</footer>
        <footer>
            <p>Thank you for your business! After 30 days of delivery no products will not be replaced.</p>
        </footer>
    </div>
  `;

  // Generate the full HTML content
  let combinedHTMLContent = '';
  const totalPages = Math.ceil(productList.length / productsPerPage);

  for (let i = 0; i < totalPages; i++) {
    const productsChunk = productList.slice(
      i * productsPerPage,
      (i + 1) * productsPerPage
    );
    const showTotals = i === totalPages - 1;
    combinedHTMLContent += generatePageHTML(
      productsChunk,
      i + 1,
      totalPages,
      showTotals
    );
  }

  const fullHTMLContent = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
       <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>KK INVOICE</title>
    <style>
              * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: Arial, sans-serif;
        }
        body {
            background-color: #f9f9f9;
        }
        .invoice {
            background-color: #fff;
            width: 100%;
            padding: 20px;
            border-radius: 10px;
            box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
            margin: auto;
        }
        .header {
            background-color: #960101; /* Dark Red */
            padding: 20px;
            color: #fff;
            text-align: center;
            font-size: 20px;
            font-weight: bold;
            border-top-left-radius: 10px;
            border-top-right-radius: 10px;
        }
        .invoice-info {
            display: flex;
            justify-content: space-between;
            margin-top: 20px;
            padding-bottom: 20px;
            border-bottom: 2px solid #e0e0e0;
        }
        .invoice-info div {
            font-size: 10px;
            color: #333;
        }
        .address-section {
            display: flex;
            justify-content: space-between;
            margin: 20px 0;
        }
        .address-section div {
            width: 45%;
        }
        .address-section p {
            margin: 5px 0;
        }
        .invoice-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
        }
        .invoice-table th {
            background-color: #f4cccc; /* Light Red */
            color: #960101; /* Dark Red */
            padding: 12px;
            border: 1px solid #ddd;
            font-size: 12px;
        }
        .invoice-table td {
            padding: 12px;
            text-align: center;
            border: 1px solid #ddd;
            font-size: 10px;
        }
        .totals {
            margin-top: 20px;
            text-align: right;
        }
        .totals p {
            margin: 5px 0;
            font-size: 10px;
        }
        .totals span {
            font-weight: bold;
            color: #960101;
        }
        .payment-instructions {
            margin-top: 30px;
        }
        footer {
            text-align: center;
            margin-top: 40px;
            font-size: 12px;
            color: #777;
        }


      @media print {
        body * {
          visibility: hidden;
        }
        #printable, #printable * {
          visibility: visible;
        }
        #printable {
          position: absolute;
          left: 0;
          top: 0;
        }
      }
    </style>
    <script>
      window.onload = function() {
        window.print();
      };
    </script>
  </head>
  <body>
    <div id="printable">
      ${combinedHTMLContent}
    </div>
  </body>
  </html>`;

  // Send the HTML as a response
  res.setHeader('Content-Type', 'text/html');
  res.send(fullHTMLContent);
});


app.get('/export', async (req, res) => {
    try {
      const collections = await mongoose.connection.db.listCollections().toArray();

      // Create a new workbook
      const workbook = xlsx.utils.book_new();

      for (const collection of collections) {
          const collectionName = collection.name;

          // Fetch all data from the current collection
          const data = await mongoose.connection.db.collection(collectionName).find({}).toArray();

          // Convert data to a worksheet
          const worksheet = xlsx.utils.json_to_sheet(data);

          // Append the worksheet to the workbook with the collection name as the sheet name
          xlsx.utils.book_append_sheet(workbook, worksheet, collectionName);
      }

      // Write to a buffer instead of a file
      const buffer = xlsx.write(workbook, { bookType: 'xlsx', type: 'buffer' });

      // Set response headers to prompt file download
      res.setHeader('Content-Disposition', 'attachment; filename=all_data.xlsx');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

      // Send the buffer as the response
      res.send(buffer);
  } catch (error) {
      console.error('Error exporting data:', error);
      res.status(500).send('Internal Server Error');
  }
});


const port = process.env.PORT || 4000;

const httpServer = http.Server(app);
const io = new Server(httpServer, { cors: { origin: '*' } });
const users = [];

io.on('connection', (socket) => {

  socket.on('disconnect', () => {
    const user = users.find((x) => x.socketId === socket.id);
    if (user) {
      user.online = false;
      console.log('Offline', user.name);
      const admin = users.find((x) => x.isAdmin && x.online);
      if (admin) {
        io.to(admin.socketId).emit('updateUser', user);
      }
    }
  });

  socket.on('onLogin', (user) => {
    const updatedUser = {
      ...user,
      online: true,
      socketId: socket.id,
      messages: [],
    };
    const existUser = users.find((x) => x._id === updatedUser._id);
    if (existUser) {
      existUser.socketId = socket.id;
      existUser.online = true;
    } else {
      users.push(updatedUser);
    }
    console.log('Online', user.name);
    const admin = users.find((x) => x.isAdmin && x.online);
    if (admin) {
      io.to(admin.socketId).emit('updateUser', updatedUser);
    }
    if (updatedUser.isAdmin) {
      io.to(updatedUser.socketId).emit('listUsers', users);
    }
  });

  socket.on('onUserSelected', (user) => {
    const admin = users.find((x) => x.isAdmin && x.online);
    if (admin) {
      const existUser = users.find((x) => x._id === user._id);
      io.to(admin.socketId).emit('selectUser', existUser);
    }
  });

  socket.on('typing', (data) => {
    socket.broadcast.emit('typing', data); // Notify other users
  });

  socket.on('stopTyping', (data) => {
    socket.broadcast.emit('stopTyping', data); // Notify other users to stop typing
  });

  socket.on('onMessage', (message) => {
    if (message.isAdmin) {
      const user = users.find((x) => x._id === message._id && x.online);
      if (user) {
        io.to(user.socketId).emit('message', message);
        user.messages.push(message);
      }
    } else {
      const admin = users.find((x) => x.isAdmin && x.online);
      if (admin) {
        io.to(admin.socketId).emit('message', message);
        const user = users.find((x) => x._id === message._id && x.online);
        user.messages.push(message);
      } else {
        io.to(socket.id).emit('message', {
          name: 'Admin',
          body: 'Sorry. I am not online right now',
        });
      }
    }
  });


// Listen for location updates from the client
socket.on('update-location', async (data) => {
  try {
    const { userId, longitude, latitude, userName } = data;

    // Basic validation
    if (typeof longitude !== 'number' || typeof latitude !== 'number') {
      throw new Error('Invalid coordinates');
    }

    // Update the location or create it if it doesn't exist
    const updatedLocation = await Location.findOneAndUpdate(
      { userId }, // Search by userId
      { name: userName, coordinates: [longitude, latitude] }, // Update name and coordinates
      { upsert: true, new: true } // If not found, create it (upsert)
    );

    // Broadcast the location update to all connected clients
    io.emit('location-updated', { userId, longitude, latitude, userName });

    // Optionally: console.log(`Location updated for user ${userId}: [${longitude}, ${latitude}]`);

  } catch (error) {
    console.error('Error updating location:', error);
  }
});





});

httpServer.listen(port, () => {
  console.log(`Serve at http://localhost:${port}`);
});

// app.listen(port, () => {
//   console.log(`Serve at http://localhost:${port}`);
// });
