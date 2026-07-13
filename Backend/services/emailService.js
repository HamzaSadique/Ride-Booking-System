import nodemailer from "nodemailer";

export const sendEmail = async (options) => {
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        service: process.env.SMTP_SERVICE,
        auth: {
            user: process.env.SMTP_MAIL,
            pass: process.env.SMTP_PASSWORD,
        },
    });

    const mailOptions = {
        from: `Elite Drive <${process.env.SMTP_MAIL}>`,
        to: options.email,
        subject: options.subject,
        // Hum text aur html dono bhejenge taake har tarah ke mail app par sahi dikhe
        text: options.message, 
        html: `
            <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                <h2 style="color: #c4ff00; background: #000; padding: 10px; display: inline-block;">Elite Drive</h2>
                <div style="font-size: 16px; color: #333; margin-top: 20px;">
                    ${options.message.replace(/\n/g, '<br>')}
                </div>
                <hr style="margin-top: 30px; border: 0; border-top: 1px solid #eee;" />
                <p style="font-size: 12px; color: #888;">This is an automated message from the Elite Drive Verification System.</p>
            </div>
        `,
    };

    await transporter.sendMail(mailOptions);
};