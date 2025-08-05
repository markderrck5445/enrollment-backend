const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const os = require('os');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Function to get local IP address
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const interface of interfaces[name]) {
      if (interface.family === 'IPv4' && !interface.internal) {
        return interface.address;
      }
    }
  }
  return 'localhost';
}

// Middleware - Allow ALL origins (for local network access)
app.use(cors({
  origin: '*', // Allow all origins
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Serve static files (your frontend)
app.use(express.static('.'));

// Create email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// Enrollment endpoint
app.post('/api/enrollment', async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      idnumber,
      dateOfBirth,
      course,
      address,
      city,
      zipCode,
      emergencyContact,
      emergencyPhone
    } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !email || !phone || !idnumber || !dateOfBirth || !course || !address || !city || !zipCode) {
      return res.status(400).json({
        success: false,
        message: 'Please fill in all required fields'
      });
    }

    // Email content for admin
    const adminEmailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #3B82F6, #8B5CF6); color: white; padding: 30px; text-align: center;">
          <h1>🎓 New Student Enrollment</h1>
          <p>A new student has submitted an enrollment application</p>
        </div>
        
        <div style="padding: 30px; background: #f8f9fa;">
          <h2>Student Information</h2>
          <p><strong>Name:</strong> ${firstName} ${lastName}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Phone:</strong> ${phone}</p>
          <p><strong>ID Number:</strong> ${idnumber}</p>
          <p><strong>Date of Birth:</strong> ${dateOfBirth}</p>
          <p><strong>Course:</strong> ${course}</p>
          
          <h3>Address</h3>
          <p><strong>Street:</strong> ${address}</p>
          <p><strong>City:</strong> ${city}</p>
          <p><strong>ZIP Code:</strong> ${zipCode}</p>
          
          ${emergencyContact || emergencyPhone ? `
            <h3>Emergency Contact</h3>
            ${emergencyContact ? `<p><strong>Name:</strong> ${emergencyContact}</p>` : ''}
            ${emergencyPhone ? `<p><strong>Phone:</strong> ${emergencyPhone}</p>` : ''}
          ` : ''}
          
          <p style="margin-top: 30px; color: #666;">
            <em>Application submitted on ${new Date().toLocaleString()}</em>
          </p>
        </div>
      </div>
    `;

    // Email content for student
    const studentEmailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #3B82F6, #8B5CF6); color: white; padding: 30px; text-align: center;">
          <h1>🎓 Enrollment Confirmation</h1>
          <p>Thank you for your enrollment application to EastView Training Institute!</p>
        </div>
        
        <div style="padding: 30px; background: #f8f9fa;">
          <p>Dear ${firstName} ${lastName},</p>
          
          <p>We have successfully received your enrollment application for <strong>${course}</strong>.</p>
          
          <div style="background: #E0F2FE; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3>What's Next?</h3>
            <ul>
              <li>Our admissions team will review your application</li>
              <li>You will receive an email within 2-3 working days</li>
              <li>If you have any questions, please reply to this email</li>
            </ul>
          </div>
          
          <p>We appreciate your interest in joining our academic community!</p>
          
          <p>Best regards,<br>The Admissions Team<br>EastView Training Institute</p>
          
          <p style="margin-top: 30px; color: #666; font-size: 14px;">
            <em>Application submitted on ${new Date().toLocaleString()}</em>
          </p>
        </div>
      </div>
    `;

    // Send email to admin
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: 'nguyagwamarkderrick@gmail.com',
      subject: `New Student Enrollment - ${firstName} ${lastName}`,
      html: adminEmailHtml,
      replyTo: email
    });

    // Send confirmation email to student
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Enrollment Application Received - EastView Training Institute',
      html: studentEmailHtml
    });

    res.json({
      success: true,
      message: 'Enrollment application submitted successfully! Check your email for confirmation.'
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process enrollment. Please try again.'
    });
  }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  const localIP = getLocalIP();
  console.log('\n🚀 Server is running on:');
  console.log(`   Local:    http://localhost:${PORT}`);
  console.log(`   Network:  http://${localIP}:${PORT}`);
  console.log(`\n📱 For mobile/other devices, use: http://${localIP}:${PORT}`);
  console.log(`📧 Email configured for: ${process.env.EMAIL_USER}`);
  console.log('\n✅ Other devices on your network can now access the enrollment form!');
});