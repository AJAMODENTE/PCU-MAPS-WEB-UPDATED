const imageInput = document.getElementById("image-input");
const uploadBtn = document.getElementById("upload-btn");
const deleteBtn = document.getElementById("delete-btn");
const previewBox = document.getElementById("preview-box");

uploadBtn.addEventListener("click", () => {
  imageInput.click(); // trigger hidden input
});

imageInput.addEventListener("change", () => {
  const file = imageInput.files[0];
  if (file && file.type.startsWith("image/")) {
    const reader = new FileReader();
    reader.onload = function (e) {
      previewBox.innerHTML = `
            <img src="${e.target.result}" alt="Preview" 
                 style="width: 100%; height: 100%; object-fit: fill; border-radius: 10px;" />
          `;
    };
    reader.readAsDataURL(file);
  } else {
    Swal.fire({
      title: "Invalid File",
      text: "Please upload a valid image file.",
      icon: "error",
      confirmButtonText: "OK",
    });
  }
});

deleteBtn.addEventListener("click", () => {
  imageInput.value = "";
  previewBox.innerHTML = "Image";
});
