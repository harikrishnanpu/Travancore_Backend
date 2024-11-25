import express from 'express';
import QRCode from 'qrcode';
import QrCodeDB from '../models/qrcodeVerificstionModal.js';
import { chromium } from 'playwright';

const printRouter = express.Router();



// Helper function to safely get values or return "N/A" if undefined
const safeGet = (value) => (value ? value : 'N/A');

printRouter.post('/generate-pdf', async (req, res) => {
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

  if(!billingAmount){
    res.status(500).json({message: 'error' });
  }

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
                <p style="font-size: 15px;"><strong>Total Amount: <span>${(billingAmount)}</span></strong></p>
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

printRouter.post('/generate-invoice-html', async (req, res) => {
  try {
    let {
      invoiceNo,
      invoiceDate,
      salesmanName,
      expectedDeliveryDate,
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
      transportation,
      unloading,
      handling,
      discount,
      products,
      perItemDiscount,
      grandTotal
    } = safeGet(req.body, '');

    // Validate required fields
    if (!invoiceNo) {
      return res.status(400).json({ error: 'invoiceNo is required' });
    }

    // Safely handle products array
    const productList = Array.isArray(products) ? products : [];
    const totalProducts = productList.length;
    billingAmount = parseFloat(billingAmount) || 0;
    paymentAmount = parseFloat(paymentAmount) || 0;

    const productsPerPage = 15;

    const NewQrCodeId = `${invoiceNo}-${Date.now()}`

    if(NewQrCodeId){
        const qrcodeDb = new QrCodeDB({
            qrcodeId: NewQrCodeId,
            billId: invoiceNo,
        })

        await qrcodeDb.save();
    }

    // Generate QR Code as Data URL
    const qrCodeDataURL = await QRCode.toDataURL(NewQrCodeId);

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
                        <!-- QR Code Section -->
          <div class="qr-code-section" style="text-align: right;">
              <img src="${qrCodeDataURL}" alt="QR Code for Invoice" style="width: 50px; height: 50px;" />
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
              <p>Remaining Amount: ${(billingAmount - paymentAmount).toFixed(2)}  </p>
          </div>

          </div>

          <!-- Invoice Table -->
          <table class="invoice-table">
              <thead>
                  <tr>
                      <th>Sl</th>
                      <th>Item Id</th>
                      <th>Item Name</th>
                      <th>Qty</th>
                      <th>Unit</th>
                      <th>Price</th>
                      <th>Qty(Nos)</th>
                      <th>Unit Rate</th>
                      <th>Discount</th>
                      <th>Total Amount</th>
                  </tr>
              </thead>
              <tbody>
                  ${
                      productsChunk.length > 0
                        ? productsChunk.map((product, index) => `
                            <tr>
                                <td>${index + 1 + (pageNumber - 1) * productsPerPage}</td> <!-- Correct serial number -->
                                <td>${safeGet(product.item_id)}</td>
                                <td>${safeGet(product.name)}</td>
                                <td>${safeGet(product.enteredQty)}</td>
                                <td>${safeGet(product.unit)}</td>
                                <td>${safeGet(product.sellingPrice)}</td>
                                <td>${safeGet(product.quantity)}</td>
                                <td>${safeGet(product.sellingPriceinQty)}</td>
                                <td>${(product.quantity * parseFloat(perItemDiscount)).toFixed(2)}</td>
                                <td>${((product.quantity * parseFloat(product.sellingPriceinQty)) - (product.quantity * parseFloat(perItemDiscount))).toFixed(2) || 'N/A'}</td>
                            </tr>`).join('')
                        : '<tr><td colspan="10">No Products Available</td></tr>'
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
                  <p>Total Amount: <span>${parseFloat(billingAmount || 0).toFixed(2)}</span></p>
                  <p>Transportation Charges: <span>${parseFloat(transportation || 0).toFixed(2)}</span></p>
                  <p>Unloading Charges: <span>${parseFloat(unloading || 0).toFixed(2)}</span></p>
                  <p>Handling Charge: <span>${parseFloat(handling || 0).toFixed(2)}</span></p>
                  <p>Round Off: <span>0.0</span></p>
                  <p style="font-size: 15px;"><strong>Grand Total: <span>${parseFloat(grandTotal || 0).toFixed(2)}</span></strong></p>
              </div>
          </div> ` : `` }

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
            page-break-after: always;
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
        .qr-code-section img {
            width: 100px;
            height: 100px;
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

    // Store the invoiceNo in the in-memory store
    // invoiceStore.add(invoiceNo);

    // Send the HTML as a response
    res.setHeader('Content-Type', 'text/html');
    res.send(fullHTMLContent);
  } catch (error) {
    console.error('Error generating invoice:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});






  
  // Route to generate Return Invoice HTML
  printRouter.post('/generate-return-invoice-html', async (req, res) => {
    try {
      // Destructure necessary fields from the request body
      let {
        returnNo,
        billingNo,
        returnDate,
        customerName,
        customerAddress,
        discount,
        products,
        returnAmount,
        cgst,
        sgst,
        totalTax,
        netReturnAmount
      } = req.body;
  
      // Validate required fields
      if (!returnNo || !billingNo || !customerName || !customerAddress || !returnDate) {
        console.log(req.body)
        return res.status(400).json({ error: 'Missing required fields.' });
      }
  
      // Safely handle products array
      const productList = Array.isArray(products) ? products : [];
      const totalProducts = productList.length;
      returnAmount = parseFloat(returnAmount) || 0;
      discount = parseFloat(discount) || 0;
      cgst = parseFloat(cgst) || 0;
      sgst = parseFloat(sgst) || 0;
      totalTax = parseFloat(totalTax) || 0;
      netReturnAmount = parseFloat(netReturnAmount) || 0;
  
      const productsPerPage = 15;
  
      // Generate a unique QR Code ID
      const NewQrCodeId = `${returnNo}-${Date.now()}`;
  
      if (NewQrCodeId) {
        const qrCodeEntry = new QrCodeDB({
          qrcodeId: NewQrCodeId,
          billId: returnNo,
        });
  
        await qrCodeEntry.save();
      }
  
      // Generate QR Code as Data URL
      const qrCodeDataURL = await QRCode.toDataURL(NewQrCodeId);
  
      // Function to generate return invoice page HTML
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
              <p style="font-size: 12px;font-weight: bolder;">Return No: <strong>${returnNo}</strong></p>
              <p>Billing No: <strong>${billingNo}</strong></p>
              <p>Return Date: <strong>${new Date(returnDate).toLocaleDateString()}</strong></p>
              <p>Discount: <strong>₹${discount}</strong></p>
            </div>
            <!-- QR Code Section -->
            <div class="qr-code-section" style="text-align: right;">
              <img src="${qrCodeDataURL}" alt="QR Code for Return Invoice" style="width: 50px; height: 50px;" />
            </div>
            <div>
              <p><strong>From:</strong></p>
              <p style="font-weight: bold;">KK TRADING</p>
              <p style="font-size: 10px;">Moncompu, Chambakulam Road</p>
              <p style="font-size: 10px;">Alappuzha, 688503</p>
              <p style="font-size: 10px;">Contact: 0477 2080282</p>
              <p style="font-size: 10px;">tradeinkk@gmail.com</p>
            </div>
          </div>
  
          <div class="invoice-info">
            <div style="font-size: 10px;">
              <p><strong>Return To:</strong></p>
              <p style="font-weight: bold;">${customerName}</p>
              <p>${customerAddress}</p>
              <p>State: Kerala</p>
            </div>
  
            <div style="font-size: 10px;">
              <p style="font-size: 15px;"><strong>Return Bill</strong></p>
            </div>
          </div>
  
          <!-- Invoice Table -->
          <table class="invoice-table">
            <thead>
              <tr>
                <th>Sl</th>
                <th>Item Id</th>
                <th>Item Name</th>
                <th>Qty</th>
                <th>Unit</th>
                <th>Price</th>
                <th>Discount</th>
                <th>Total Amount</th>
              </tr>
            </thead>
            <tbody>
              ${
                productsChunk.length > 0
                  ? productsChunk.map((product, index) => `
                    <tr>
                      <td>${index + 1 + (pageNumber - 1) * productsPerPage}</td>
                      <td>${safeGet(product.item_id)}</td>
                      <td>${safeGet(product.name)}</td>
                      <td>${safeGet(product.quantity)}</td>
                      <td>${safeGet(product.unit)}</td>
                      <td>₹${safeGet(product.returnPrice)}</td>
                      <td>₹${(product.quantity * parseFloat(discount / totalProducts))}</td>
                      <td>₹${netReturnAmount}</td>
                    </tr>
                  `).join('')
                  : '<tr><td colspan="8">No Products Available</td></tr>'
              }
            </tbody>
          </table>
  
          <!-- Totals Section -->
          ${showTotals ? `
            <div style="display: flex; justify-content: space-between;" class="totals">
              <div style="font-size: 10px;margin-top: 30px;" class="payment-instructions">
                <p><strong>Authorised Signatory:</strong></p>
                <p style="margin-top: 40px;">Date: ------------------------------</p>
                <p style="font-weight: bold;text-align: center;margin-top: 20px;">KK TRADING</p>
              </div>
              <div>
                <p>Subtotal: <span>₹${returnAmount}</span></p>
                <p>CGST (9%): <span>₹${cgst}</span></p>
                <p>SGST (9%): <span>₹${sgst}</span></p>
                <p>Total Tax: <span>₹${totalTax}</span></p>
                <p>Grand Total: <span>₹${netReturnAmount}</span></p>
              </div>
            </div>
          ` : ``}
  
          <!-- Footer Section -->
          <footer>Page ${pageNumber} of ${totalPages}</footer>
          <footer>
            <p>Thank you for your business! Returns must be made within 30 days of purchase.</p>
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
        <title>KK RETURN INVOICE</title>
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
            page-break-after: always;
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
          .qr-code-section img {
            width: 100px;
            height: 100px;
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
    } catch (error) {
      console.error('Error generating return invoice:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });






export default printRouter;