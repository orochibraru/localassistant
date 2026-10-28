variable "APP_VERSION" {
  default = ""
}

group "default" {
  targets = ["app"]
}

target "app" {
  context    = "."
  dockerfile = "Dockerfile"
  args = {
    APP_VERSION = APP_VERSION
  }
}
