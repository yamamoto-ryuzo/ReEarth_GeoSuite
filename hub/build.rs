fn main() -> std::io::Result<()> {
    #[cfg(windows)]
    {
        use winres::WindowsResource;
        WindowsResource::new()
            .set_icon("assets/icon.ico")
            .set("ProductName", "GeoSuite hub")
            .set("FileDescription", "GeoSuite dedicated local bridge hub (127.0.0.1:8514)")
            .set("CompanyName", "yamamoto-ryuzo")
            .set("LegalCopyright", "MIT License")
            .compile()?;
    }
    Ok(())
}
